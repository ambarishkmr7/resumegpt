import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def send_otp_email(to_email: str, otp: str, settings) -> None:
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        raise RuntimeError("SMTP not configured. Set SMTP_USER and SMTP_PASSWORD in .env")

    sender = settings.SMTP_FROM or settings.SMTP_USER

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"ResumeGPT — Your verification code: {otp}"
    msg["From"] = sender
    msg["To"] = to_email

    text = (
        f"Your ResumeGPT verification code is: {otp}\n\n"
        "This code expires in 5 minutes. Do not share it with anyone."
    )
    html = f"""
    <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:28px">
      <h2 style="color:#d97706;margin:0 0 8px">ResumeGPT</h2>
      <p style="color:#444;margin:0 0 20px">Your one-time verification code:</p>
      <div style="font-size:38px;font-weight:700;letter-spacing:10px;color:#1a1a1a;
                  background:#f5f0e8;padding:18px;text-align:center;border-radius:10px">
        {otp}
      </div>
      <p style="color:#888;font-size:12px;margin-top:18px">
        This code expires in 5 minutes. Do not share it with anyone.
      </p>
    </div>
    """

    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    _send(msg, sender, to_email, settings)


def send_reset_email(to_email: str, reset_link: str, settings) -> None:
    """Send a password-reset link. Raises RuntimeError if SMTP isn't configured."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        raise RuntimeError("SMTP not configured. Set SMTP_USER and SMTP_PASSWORD in .env")

    sender = settings.SMTP_FROM or settings.SMTP_USER

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "ResumeGPT — Reset your password"
    msg["From"] = sender
    msg["To"] = to_email

    text = (
        "We received a request to reset your ResumeGPT password.\n\n"
        f"Reset it here (link expires in 30 minutes):\n{reset_link}\n\n"
        "If you didn't request this, you can safely ignore this email."
    )
    html = f"""
    <div style="font-family:sans-serif;max-width:440px;margin:0 auto;padding:28px">
      <h2 style="color:#d97706;margin:0 0 8px">ResumeGPT</h2>
      <p style="color:#444;margin:0 0 18px">We received a request to reset your password.</p>
      <a href="{reset_link}"
         style="display:inline-block;background:#d97706;color:#fff;text-decoration:none;
                padding:12px 22px;border-radius:8px;font-weight:600">Reset password</a>
      <p style="color:#888;font-size:12px;margin-top:20px">
        This link expires in 30 minutes. If you didn't request a reset, ignore this email.
      </p>
    </div>
    """

    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    _send(msg, sender, to_email, settings)


def _send(msg, sender: str, to_email: str, settings) -> None:
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(sender, to_email, msg.as_string())
