from io import BytesIO

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification

MODEL_ID = "dima806/attractive_faces_celebs_detection"

app = FastAPI(title="Chopped Rating API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

processor = AutoImageProcessor.from_pretrained(MODEL_ID)
model = AutoModelForImageClassification.from_pretrained(MODEL_ID)
model.eval()


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
def health():
    return {"ok": True, "model": MODEL_ID}


@app.post("/rate")
async def rate_face(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        image = Image.open(BytesIO(content)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file")

    inputs = processor(images=image, return_tensors="pt")

    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.softmax(outputs.logits, dim=-1)[0]

    attractive_prob = float(probs[0].item())
    not_attractive_prob = float(probs[1].item())

    chopped_score = round(not_attractive_prob * 100)
    label = build_label(chopped_score)

    return {
        "model": MODEL_ID,
        "attractiveProbability": round(attractive_prob, 4),
        "notAttractiveProbability": round(not_attractive_prob, 4),
        "choppedScore": chopped_score,
        "label": label,
        "roasts": build_roasts(chopped_score),
    }