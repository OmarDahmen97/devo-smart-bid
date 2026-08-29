import os
import sys
import time
from pymongo import MongoClient
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.profiling.profile_detector_full_cv import detect_profiles_full
from app.profiling.profile_builder import build_profiles_document, store_candidate_profiles

load_dotenv()
client = MongoClient(os.getenv("MONGO_URI"))
db = client["cv_platform"]
candidates = db["candidatesV2"]
candidate_profiles = db["candidate_profiles"]

already_done = {doc["candidate_id"] for doc in candidate_profiles.find({}, {"candidate_id": 1})}
print(f"{len(already_done)} candidats déjà traités")

for i, candidate in enumerate(candidates.find()):
    candidate_id = str(candidate["_id"])
    if candidate_id in already_done:
        print(f"[{i+1}] SKIP: {candidate.get('name', '?')} (déjà traité)")
        continue
    if not candidate.get("versions"):
        print(f"[{i+1}] SKIP: {candidate.get('name', '?')} (aucune version)")
        continue
    print(f"[{i+1}] Traitement: {candidate.get('name', '?')}...")
    result = detect_profiles_full(candidate)
    doc = build_profiles_document(candidate, result)
    store_candidate_profiles(candidate_profiles, doc)
    print(f"  → {len(doc['profiles'])} profils stockés")
    time.sleep(1)