# file: check_structure.py
import os
from pymongo import MongoClient
from dotenv import load_dotenv
import json

load_dotenv()
client = MongoClient(os.getenv("MONGO_URI"))
db = client["cv_platform"]
merged = db["merged_candidates"]

doc = merged.find_one({"name": "Sabria Jeribi"})  # ou filtre par name si tu veux un candidat précis
doc["_id"] = str(doc["_id"])
doc["candidate_id"] = str(doc["candidate_id"])
print(json.dumps(doc, indent=2, ensure_ascii=False, default=str))