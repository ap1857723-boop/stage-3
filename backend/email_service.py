import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import config

def send_ticket_email(recipient_email: str, username: str, show_title: str, show_time: str, seats: list, total_paid: int, booking_id: int):
    subject = f"Your Cinemax Tickets: {show_title}"
    body = f"""
    <html>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #333; padding: 30px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="text-align: center; border-bottom: 2px dashed #eee; padding-bottom: 20px; margin-bottom: 20px;">
                <h1 style="color: #3b82f6; margin: 0; font-size: 28px;">🍿 Cinemax VIP Ticket</h1>
                <p style="color: #64748b; margin-top: 5px;">Your digital entry pass</p>
            </div>
            
            <p style="font-size: 16px;">Hi <strong>{username}</strong>,</p>
            <p style="font-size: 16px; color: #475569;">Your booking was successful! Please present this digital receipt at the front entrance.</p>
            
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0;">
                <h3 style="margin-top: 0; color: #1e293b; font-size: 20px;">🎬 {show_title}</h3>
                <p style="margin: 8px 0; font-size: 15px;"><strong>Show Time:</strong> {show_time}</p>
                <p style="margin: 8px 0; font-size: 15px;"><strong>Reserved Seats:</strong> {', '.join(seats)}</p>
                <p style="margin: 8px 0; font-size: 15px;"><strong>Total Paid:</strong> <span style="color: #22c55e; font-weight: bold;">${total_paid}</span></p>
                <p style="margin: 8px 0; font-size: 15px;"><strong>Ticket ID:</strong> TKT-{booking_id}</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
                <p style="font-size: 14px; color: #94a3b8;">Thank you for choosing the Cinematic Experience!</p>
                <p style="font-size: 12px; color: #cbd5e1;">© 2026 Cinemax Systems.</p>
            </div>
        </div>
    </body>
    </html>
    """

    if config.SMTP_EMAIL == "dummy@example.com":
        # Mock Email - save to local directory to simulate inbox
        os.makedirs("../frontend/emails", exist_ok=True)
        filename = f"../frontend/emails/Ticket_{booking_id}_{username}.html"
        with open(filename, "w", encoding="utf-8") as f:
            f.write(body)
        print(f"DEV MODE: Saved mocked email to {filename}")
        return True

    # Real Email Sending execution logic bridging the internet!
    try:
        msg = MIMEMultipart()
        msg['From'] = f"Cinemax <{config.SMTP_EMAIL}>"
        msg['To'] = recipient_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html'))
        
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(config.SMTP_EMAIL, config.SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"Failed to send real external email: {e}")
        return False
