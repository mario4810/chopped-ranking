import asyncio
import logging
import os
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Any

import torch
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from transformers import AutoImageProcessor, AutoModelForImageClassification

logger = logging.getLogger("chopped")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

MODEL_ID = os.getenv("MODEL_ID", "dima806/attractive_faces_celebs_detection")
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
RATE_LIMIT_RATE = os.getenv("RATE_LIMIT_RATE", "30/minute")
RATE_LIMIT_GLOBAL = os.getenv("RATE_LIMIT_GLOBAL", "120/minute")
ENV = os.getenv("ENV", "production").lower()
ENABLE_DOCS = os.getenv("ENABLE_DOCS", "1" if ENV == "development" else "0") == "1"


def _client_key(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_client_key, default_limits=[RATE_LIMIT_GLOBAL])

torch.set_num_threads(int(os.getenv("TORCH_NUM_THREADS", "1")))


class Classifier:
    def __init__(self, model_id: str) -> None:
        self.model_id = model_id
        self.processor: Any = None
        self.model: Any = None

    def load(self) -> None:
        logger.info("Loading model %s", self.model_id)
        self.processor = AutoImageProcessor.from_pretrained(self.model_id)
        model = AutoModelForImageClassification.from_pretrained(self.model_id)
        model.train(False)
        self.model = model
        logger.info("Model loaded")

    @torch.inference_mode()
    def predict(self, image: Image.Image) -> tuple[float, float]:
        inputs = self.processor(images=image, return_tensors="pt")
        outputs = self.model(**inputs)
        probs = torch.softmax(outputs.logits, dim=-1)[0]
        return float(probs[0].item()), float(probs[1].item())


classifier = Classifier(MODEL_ID)

# Per-client in-flight tracking. MAC addresses aren't available to a web service,
# so we use the client's network identity (IP) as the closest practical proxy and
# allow only one concurrent /rate request per client.
_inflight_lock = asyncio.Lock()
_inflight: set[str] = set()


@asynccontextmanager
async def lifespan(_: FastAPI):
    classifier.load()
    yield


app = FastAPI(
    title="Chopped Rating API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url="/redoc" if ENABLE_DOCS else None,
    openapi_url="/openapi.json" if ENABLE_DOCS else None,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def build_label(score: int) -> str:
    if score >= 90:
        return "catastrophically chopped"
    if score >= 75:
        return "severely chopped"
    if score >= 60:
        return "noticeably chopped"
    if score >= 40:
        return "moderately chopped"
    if score >= 20:
        return "lightly chopped"
    return "biblically unchopped"


def build_roasts(score: int) -> list[str]:
    if score >= 80:
        return [
            "The camera filed a formal complaint.",
            "Jawline currently under investigation.",
            "Aura could not offset the damage.",
        ]
    if score >= 60:
        return [
            "The angle tried its best.",
            "Some potential detected through the smoke.",
            "Lighting was doing heavy lifting.",
        ]
    if score >= 40:
        return [
            "Mixed report from the chopped committee.",
            "Not doomed, not safe either.",
            "A controversial performance.",
        ]
    if score >= 20:
        return [
            "Strong recovery signs detected.",
            "Face card mostly valid.",
            "Minor chopped allegations only.",
        ]
    return [
        "Unfair levels of facial stability detected.",
        "The app is accusing you of pretty privilege.",
        "Completely unchopped behavior.",
    ]


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "model": MODEL_ID}


@app.post("/rate")
@limiter.limit(RATE_LIMIT_RATE)
async def rate_face(request: Request, file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    client_id = _client_key(request)
    async with _inflight_lock:
        if client_id in _inflight:
            raise HTTPException(
                status_code=429,
                detail="Another request from this client is already in progress",
            )
        _inflight.add(client_id)

    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty file")
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File too large")

        try:
            with Image.open(BytesIO(content)) as raw:
                raw.load()
                image = raw.convert("RGB")
        except (UnidentifiedImageError, OSError):
            raise HTTPException(status_code=400, detail="Invalid image file")

        try:
            attractive_prob, not_attractive_prob = await asyncio.to_thread(
                classifier.predict, image
            )
        finally:
            image.close()
    finally:
        await file.close()
        async with _inflight_lock:
            _inflight.discard(client_id)

    chopped_score = round(not_attractive_prob * 100)
    return {
        "model": MODEL_ID,
        "attractiveProbability": round(attractive_prob, 4),
        "notAttractiveProbability": round(not_attractive_prob, 4),
        "choppedScore": chopped_score,
        "label": build_label(chopped_score),
        "roasts": build_roasts(chopped_score),
    }
