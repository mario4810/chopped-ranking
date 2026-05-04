import asyncio
import logging
import os
import random
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
    # init DB tables
    from db import init_db  # noqa: WPS433 — lazy to avoid import-time IO

    init_db()
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
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

from groups import router as groups_router  # noqa: E402

app.include_router(groups_router)


def build_label(score: int) -> str:
    if score >= 90:
        return random.choice(
            [
                "catastrophically chopped",
                "diplomatically chopped beyond repair",
                "chopped with intent",
                "biblically chopped",
            ]
        )
    if score >= 75:
        return random.choice(
            [
                "severely chopped",
                "very much chopped, your honor",
                "chopped, parboiled, then chopped again",
            ]
        )
    if score >= 60:
        return random.choice(
            [
                "noticeably chopped",
                "casually chopped",
                "moderately under indictment",
            ]
        )
    if score >= 40:
        return random.choice(
            [
                "moderately chopped",
                "neither here nor there, mostly there",
                "officially mid",
            ]
        )
    if score >= 20:
        return random.choice(
            [
                "lightly chopped",
                "barely chopped, suspicious",
                "the committee is intrigued",
            ]
        )
    return random.choice(
        [
            "biblically unchopped",
            "frighteningly unchopped",
            "unchopped, almost rude about it",
        ]
    )


_ROASTS_SAVAGE = [
    "The camera filed a formal complaint and a restraining order.",
    "Jawline currently under investigation by international authorities.",
    "Aura readings came back redacted.",
    "Lighting filed for emotional distress.",
    "Your selfie was used to scare ghosts in a focus group.",
    "Mirror saw it once and crossed the street.",
    "Front camera applied for hardship leave.",
    "The chopped committee asked for a translator.",
    "Three judges quit. The fourth is just laughing.",
    "Filter technology has officially given up.",
    "Even the AI took a deep breath before saying that.",
]
_ROASTS_ROUGH = [
    "The angle tried its best. Its best was insufficient.",
    "Some potential detected through the smoke and the mirrors.",
    "Lighting was doing the heaviest lifting in this gym.",
    "Aura is in beta. Please update.",
    "Camera is begging for a different subject.",
    "There's a face here. The committee admits that much.",
    "Recoverable, with significant capital investment.",
    "Honestly, it's a vibe. A concerning vibe.",
]
_ROASTS_MID = [
    "Mixed report from the chopped committee. Two judges are napping.",
    "Not doomed, not safe either. Schrodinger's face card.",
    "A controversial performance, like every show you binge.",
    "Could go either way; depends on the lighting and your friends' standards.",
    "Solid mid. Reliable mid. The mid you want in a teammate.",
]
_ROASTS_OK = [
    "Strong recovery signs detected. Keep doing whatever you're doing.",
    "Face card mostly valid. Minor allegations only.",
    "The committee leaned forward. Slightly.",
    "Aura: passing the vibe check by a comfortable margin.",
    "Borderline serving. Nobody's calling the police.",
]
_ROASTS_GOAT = [
    "Unfair levels of facial stability detected.",
    "The app is accusing you of pretty privilege in writing.",
    "Completely unchopped behavior. Disgustingly so.",
    "Front camera weeping with relief.",
    "Symmetry is filing for tax-exempt status.",
    "The committee suspects performance-enhancing genetics.",
    "Three exes just received a notification.",
]


def build_roasts(score: int) -> list[str]:
    if score >= 80:
        pool = _ROASTS_SAVAGE
    elif score >= 60:
        pool = _ROASTS_ROUGH
    elif score >= 40:
        pool = _ROASTS_MID
    elif score >= 20:
        pool = _ROASTS_OK
    else:
        pool = _ROASTS_GOAT
    return random.sample(pool, k=min(3, len(pool)))


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
