from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import router
from models import init_db

app = FastAPI(title="Cinemax Booking Architecture API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    init_db()

app.include_router(router)
