import os
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import auth
from linked_list import CinemaSeating

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./database.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    email = Column(String)
    role = Column(String)
    full_name = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    address = Column(String, nullable=True)

class Show(Base):
    __tablename__ = "shows"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    time = Column(String)
    regular_price = Column(Integer, default=10)
    vip_price = Column(Integer, default=20)
    rows = Column(Integer, default=10)
    seats_per_row = Column(Integer, default=7)
    image_url = Column(String)
    description = Column(String)

class Seat(Base):
    __tablename__ = "seats"
    id = Column(Integer, primary_key=True, index=True)
    show_id = Column(Integer, index=True)
    row_number = Column(Integer)
    seat_number = Column(Integer)
    status = Column(String)
    locked_by = Column(Integer, nullable=True)
    locked_until = Column(DateTime, nullable=True)

class Booking(Base):
    __tablename__ = "bookings"
    booking_id = Column(Integer, primary_key=True, index=True)
    show_id = Column(Integer, index=True)
    row_number = Column(Integer)
    seat_number = Column(Integer)
    user_id = Column(Integer)
    timestamp = Column(DateTime, default=datetime.utcnow)

seating_systems = {}

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    if db.query(User).count() == 0:
        admin = User(username="admin", password_hash=auth.hash_password("admin123"), email="admin@cinemax.com", role="admin")
        user1 = User(username="johndoe", password_hash=auth.hash_password("password123"), email="john@doe.com", role="user")
        db.add(admin)
        db.add(user1)
        db.commit()

    if db.query(Show).count() == 0:
        shows_data = [
            ("Avengers: Endgame", "10:00 AM", 12, 25, 10, 7, "https://m.media-amazon.com/images/M/MV5BMTc5MDE2ODcwNV5BMl5BanBnXkFtZTgwMzI2NzQ2NzM@._V1_FMjpg_UX1000_.jpg", "The epic conclusion to the Infinity Saga. A cinematic masterpiece wrapping up decades of storytelling into an earth shattering final standoff."), 
            ("The Batman", "02:00 PM", 10, 20, 10, 7, "https://m.media-amazon.com/images/M/MV5BMDdmMTBiNTYtMDIzNi00NGVlLWIzMDYtZTk3MTQ3NGQxZGEwXkEyXkFqcGdeQXVyMzMwOTU5MDk@._V1_FMjpg_UX1000_.jpg", "A gritty, dark take on the caped crusader uncovering endless sprawling corruption deep within the flooded trenches of Gotham City."), 
            ("Spider-Man: No Way Home", "08:00 PM", 15, 30, 8, 12, "https://m.media-amazon.com/images/M/MV5BZWMyYzFjYTYtNTRjYi00OGExLWE2YzgtOGRmYjAxZTU3NzBiXkEyXkFqcGdeQXVyMzQ0MzA0NTM@._V1_FMjpg_UX1000_.jpg", "Spider-Man's identity is officially revealed, violently unmasking the entire multiverse requiring unexpected alliances to preserve existence.")
        ]
        for t, tm, reg, vip, r, s, iu, d in shows_data:
            show = Show(title=t, time=tm, regular_price=reg, vip_price=vip, rows=r, seats_per_row=s, image_url=iu, description=d)
            db.add(show)
            db.commit()
            db.refresh(show)
            
            for row in range(r):
                for seat in range(1, s + 1):
                    db.add(Seat(show_id=show.id, row_number=row, seat_number=seat, status='available'))
        db.commit()

    all_shows = db.query(Show).all()
    for show in all_shows:
        seating_systems[show.id] = CinemaSeating(rows=show.rows, seats_per_row=show.seats_per_row)

    expired_seats = db.query(Seat).filter(Seat.status == 'locked', Seat.locked_until < datetime.utcnow()).all()
    for seat in expired_seats:
        seat.status = 'available'
        seat.locked_by = None
        seat.locked_until = None
    db.commit()

    available_seats = db.query(Seat).filter(Seat.status == 'available').all()
    available_by_show_and_row = {}
    for seat in available_seats:
        sh, r, s = seat.show_id, seat.row_number, seat.seat_number
        if sh not in available_by_show_and_row: available_by_show_and_row[sh] = {}
        if r not in available_by_show_and_row[sh]: available_by_show_and_row[sh][r] = []
        available_by_show_and_row[sh][r].append(s)
        
    for show in all_shows:
        show_seats = available_by_show_and_row.get(show.id, {})
        seating_systems[show.id].init_available_seats(show_seats)
        
    db.close()
