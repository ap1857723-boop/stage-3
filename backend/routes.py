from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import List, Optional
import os
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from models import get_db, seating_systems, User, Show, Seat, Booking
from linked_list import CinemaSeating
import auth
import config
from email_service import send_ticket_email

router = APIRouter()

class AuthRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    address: Optional[str] = None

class SeatPos(BaseModel):
    row_number: int
    seat_number: int

class LockRequest(BaseModel):
    show_id: int
    seats: List[SeatPos]

class CancelRequest(BaseModel):
    show_id: int
    row_number: int
    seat_number: int

class ShowRequest(BaseModel):
    title: str
    time: str
    regular_price: int = 10
    vip_price: int = 20
    rows: int = 10
    seats_per_row: int = 7
    image_url: str = ""
    description: str = ""

def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.split(" ")[1]
    payload = auth.decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload

def clear_expired_locks(db: Session):
    expired = db.query(Seat).filter(Seat.status == 'locked', Seat.locked_until < datetime.utcnow()).all()
    if expired:
        for e in expired:
            e.status = 'available'
            e.locked_by = None
            e.locked_until = None
            if e.show_id in seating_systems:
                seating_systems[e.show_id].cancel_booking(e.row_number, e.seat_number)
        db.commit()

@router.post("/register")
def register_user(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == req.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username taken")
    
    new_user = User(
        username=req.username, 
        password_hash=auth.hash_password(req.password), 
        email=req.email, 
        role='user',
        full_name=req.full_name,
        phone_number=req.phone_number,
        address=req.address
    )
    db.add(new_user)
    db.commit()
    return {"message": "Success"}

@router.post("/login")
def login_user(req: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not auth.verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
        
    token = auth.create_access_token(user.id, user.role, user.username)
    return {"token": token, "username": user.username, "role": user.role}

# --- USER PROFILE API ---
@router.get("/user/profile")
def get_user_profile(user_token = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == int(user_token['sub'])).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "phone_number": user.phone_number,
        "address": user.address
    }

@router.put("/user/profile")
def update_user_profile(req: dict, user_token = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == int(user_token['sub'])).first()
    if not user: raise HTTPException(status_code=404)
    if 'full_name' in req: user.full_name = req['full_name']
    if 'phone_number' in req: user.phone_number = req['phone_number']
    if 'address' in req: user.address = req['address']
    db.commit()
    return {"message": "Profile updated"}

# --- SHOWS & POSTERS ---
@router.get("/shows")
def get_shows(db: Session = Depends(get_db)):
    shows = db.query(Show).all()
    return {"shows": [{"id": s.id, "title": s.title, "time": s.time, "regular_price": s.regular_price, "vip_price": s.vip_price, "rows": s.rows, "seats_per_row": s.seats_per_row, "image_url": s.image_url, "description": s.description} for s in shows]}

@router.post("/admin/shows")
def add_show(req: ShowRequest, user = Depends(get_current_user), db: Session = Depends(get_db)):
    if user['role'] != 'admin': raise HTTPException(status_code=403, detail="Admin required")
    
    new_show = Show(title=req.title, time=req.time, regular_price=req.regular_price, vip_price=req.vip_price, rows=req.rows, seats_per_row=req.seats_per_row, image_url=req.image_url, description=req.description)
    db.add(new_show)
    db.commit()
    db.refresh(new_show)
    
    for row in range(req.rows):
        for seat in range(1, req.seats_per_row + 1):
            db.add(Seat(show_id=new_show.id, row_number=row, seat_number=seat, status='available'))
    db.commit()
    
    from linked_list import CinemaSeating
    new_system = CinemaSeating(rows=req.rows, seats_per_row=req.seats_per_row)
    new_system.init_available_seats({r: [s for s in range(1, req.seats_per_row + 1)] for r in range(req.rows)})
    seating_systems[new_show.id] = new_system
    return {"message": "Show seeded"}

@router.delete("/admin/shows/{show_id}")
def delete_show(show_id: int, user = Depends(get_current_user), db: Session = Depends(get_db)):
    if user['role'] != 'admin': raise HTTPException(status_code=403, detail="Admin required")
    db.query(Booking).filter(Booking.show_id == show_id).delete()
    db.query(Seat).filter(Seat.show_id == show_id).delete()
    db.query(Show).filter(Show.id == show_id).delete()
    db.commit()
    if show_id in seating_systems: del seating_systems[show_id]
    return {"message": "Wiped"}

# --- TICKET LOCKS & CHECKOUTS ---
@router.post("/seats/lock")
def lock_seats(req: LockRequest, user = Depends(get_current_user), db: Session = Depends(get_db)):
    clear_expired_locks(db)
    system = seating_systems[req.show_id]
    user_id = int(user['sub'])
    
    for s in req.seats:
        seat = db.query(Seat).filter(Seat.show_id == req.show_id, Seat.row_number == s.row_number, Seat.seat_number == s.seat_number).first()
        if not seat or seat.status != 'available':
            raise HTTPException(status_code=400, detail="Taken")
            
    for s in req.seats:
        system.book_seat(s.row_number, s.seat_number)
        seat = db.query(Seat).filter(Seat.show_id == req.show_id, Seat.row_number == s.row_number, Seat.seat_number == s.seat_number).first()
        seat.status = 'locked'
        seat.locked_by = user_id
        seat.locked_until = datetime.utcnow() + timedelta(minutes=5)
    db.commit()
    return {"message": "Locked"}

@router.post("/create-payment-intent")
def create_payment_intent(req: LockRequest, user = Depends(get_current_user), db: Session = Depends(get_db)):
    show = db.query(Show).filter(Show.id == req.show_id).first()
    total_amount = sum([show.vip_price if s.row_number >= (show.rows - 2) else show.regular_price for s in req.seats])
    if config.STRIPE_SECRET_KEY == "sk_test_replace_me": return {"client_secret": "pi_mock"}
        
    import stripe
    stripe.api_key = config.STRIPE_SECRET_KEY
    intent = stripe.PaymentIntent.create(amount=total_amount * 100, currency="usd")
    return {"client_secret": intent.client_secret}

@router.post("/seats/book")
def finalize_booking(req: LockRequest, user = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = int(user['sub'])
    booking_ids = []
    
    show_meta = db.query(Show).filter(Show.id == req.show_id).first()
    total_paid = 0

    for s in req.seats:
        seat = db.query(Seat).filter(Seat.show_id == req.show_id, Seat.row_number == s.row_number, Seat.seat_number == s.seat_number).first()
        if not seat or seat.status != 'locked' or seat.locked_by != user_id:
            raise HTTPException(status_code=400, detail="Checkout expired")
            
        seat.status = 'booked'
        seat.locked_until = None
        new_b = Booking(show_id=req.show_id, row_number=s.row_number, seat_number=s.seat_number, user_id=user_id)
        db.add(new_b)
        db.flush()
        booking_ids.append(new_b.booking_id)
        total_paid += show_meta.vip_price if s.row_number >= (show_meta.rows - 2) else show_meta.regular_price
        
    u_data = db.query(User).filter(User.id == user_id).first()
    db.commit()
    
    row_letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T']
    seat_strs = [f"{row_letters[s.row_number]}{s.seat_number}" for s in req.seats]
    send_ticket_email(u_data.email, user['username'], show_meta.title, show_meta.time, seat_strs, total_paid, booking_ids[0])
    return {"message": "Success"}

@router.post("/seats/unlock")
def unlock_seats(req: LockRequest, user = Depends(get_current_user), db: Session = Depends(get_db)):
    for s in req.seats:
        seat = db.query(Seat).filter(Seat.show_id == req.show_id, Seat.row_number == s.row_number, Seat.seat_number == s.seat_number).first()
        if seat and seat.locked_by == int(user['sub']):
            seat.status = 'available'
            seat.locked_by = None
            seat.locked_until = None
            if req.show_id in seating_systems:
                seating_systems[req.show_id].cancel_booking(s.row_number, s.seat_number)
    db.commit()
    return {"message": "Locks cleared"}

@router.get("/seats/layout")
def get_layout(show_id: int, db: Session = Depends(get_db)):
    clear_expired_locks(db)
    seats = db.query(Seat).filter(Seat.show_id == show_id).order_by(Seat.row_number, Seat.seat_number).all()
    meta = db.query(Show).filter(Show.id == show_id).first()
    if not meta:
        raise HTTPException(status_code=400, detail="Show not found")
        
    layout = {}
    for s in seats:
        r = s.row_number
        if r not in layout: layout[r] = []
        layout[r].append({"seat_number": s.seat_number, "status": s.status, "locked_by": s.locked_by})
    return {"layout": layout, "rows": meta.rows, "seats_per_row": meta.seats_per_row}

@router.get("/user/bookings")
def get_user_bookings(user = Depends(get_current_user), db: Session = Depends(get_db)):
    bookings = db.query(Booking, Show).join(Show, Booking.show_id == Show.id).filter(Booking.user_id == int(user['sub'])).order_by(Booking.timestamp.desc()).all()
    records = []
    for b, s in bookings:
        records.append({"booking_id": b.booking_id, "row_number": b.row_number, "seat_number": b.seat_number, "timestamp": b.timestamp, "title": s.title, "time": s.time, "image_url": s.image_url})
    return {"bookings": records}

@router.get("/admin/analytics")
def get_analytics(user = Depends(get_current_user), db: Session = Depends(get_db)):
    if user['role'] != 'admin': raise HTTPException(status_code=403, detail="Admin only")
    
    bookings = db.query(Booking, Show).join(Show, Booking.show_id == Show.id).all()
    total_rev = 0
    title_counts = {}
    
    for b, s in bookings:
        total_rev += s.vip_price if b.row_number >= (s.rows - 2) else s.regular_price
        title_counts[s.title] = title_counts.get(s.title, 0) + 1
        
    pop = max(title_counts, key=title_counts.get) if title_counts else "N/A"
    return {"total_revenue": total_rev, "tickets_sold": len(bookings), "popular_movie": pop}

@router.post("/admin/cancel")
def admin_cancel_booking(req: CancelRequest, user = Depends(get_current_user), db: Session = Depends(get_db)):
    if user['role'] != 'admin': raise HTTPException(status_code=403)
    seat = db.query(Seat).filter(Seat.show_id == req.show_id, Seat.row_number == req.row_number, Seat.seat_number == req.seat_number).first()
    if not seat: raise HTTPException(status_code=400)
    seating_systems[req.show_id].cancel_booking(req.row_number, req.seat_number)
    seat.status = 'available'
    seat.locked_by = None
    seat.locked_until = None
    db.query(Booking).filter(Booking.show_id == req.show_id, Booking.row_number == req.row_number, Booking.seat_number == req.seat_number).delete()
    db.commit()
    return {"message": "Reversed"}

@router.get("/admin/bookings")
def get_all_bookings(user = Depends(get_current_user), db: Session = Depends(get_db)):
    if user['role'] != 'admin': raise HTTPException(status_code=403)
    bookings = db.query(Booking, Show, User).join(Show, Booking.show_id == Show.id).join(User, Booking.user_id == User.id).order_by(Booking.timestamp.desc()).all()
    records = []
    for b, s, u in bookings:
        records.append({"booking_id": b.booking_id, "show_id": b.show_id, "row_number": b.row_number, "seat_number": b.seat_number, "username": u.username, "email": u.email, "timestamp": b.timestamp, "title": s.title, "time": s.time})
    return {"bookings": records}
