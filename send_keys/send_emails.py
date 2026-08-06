"""
Send each student their personalized lab_key via Gmail SMTP.

Setup:
  1. pip install --break-system-packages python-dotenv   (optional, or just hardcode below)
  2. Generate a Gmail App Password:
     Google Account -> Security -> 2-Step Verification -> App Passwords
  3. Fill in GMAIL_ADDRESS and GMAIL_APP_PASSWORD below (or set as env vars).
  4. Put your CSV (columns: student_id,name,email,team_code,lab_key) next to this script.
  5. Run: python3 send_keys.py students.csv

Notes:
  - Sends one email at a time with a short delay to avoid Gmail rate limits/spam flags.
  - Gmail's free sending limit is ~500 emails/day for personal accounts, so 140 is safe.
  - Logs successes/failures to send_log.csv so you can re-run only the failed ones.
"""

import csv
import smtplib
import ssl
import sys
import time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from dotenv import load_dotenv

load_dotenv()  # reads .env in the same folder as this script

# ---- CONFIG ----
GMAIL_ADDRESS = os.environ.get("GMAIL_ADDRESS", "youraddress@gmail.com")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "your16charapppassword")
SUBJECT = "Common Subject"
DELAY_SECONDS = 2  # pause between sends, be polite to Gmail's servers


def build_body(row):
    return f"""Dear {row['name']},

Here are your credentials for the CSE 4495 lab environment:

Student ID: {row['student_id']}
Team Code: {row['team_code']}
X-STQA-Key: {row['lab_key']}

Please keep this key confidential — do not share it with other students.

Best,
YOUR NAME
"""

def send_email(smtp, to_addr, row):
    msg = MIMEMultipart()
    msg["From"] = GMAIL_ADDRESS
    msg["To"] = to_addr
    msg["Subject"] = SUBJECT
    msg.attach(MIMEText(build_body(row), "plain"))
    smtp.sendmail(GMAIL_ADDRESS, to_addr, msg.as_string())

def main(csv_path):
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = list(csv.DictReader(f))

    required_cols = {"student_id", "name", "email", "team_code", "lab_key"}
    missing = required_cols - set(reader[0].keys())
    if missing:
        print(f"ERROR: CSV is missing columns: {missing}")
        sys.exit(1)

    print(f"Loaded {len(reader)} students. Connecting to Gmail...")

    context = ssl.create_default_context()
    results = []

    with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
        smtp.starttls(context=context)
        smtp.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)

        for i, row in enumerate(reader, 1):
            to_addr = row["email"].strip()
            try:
                send_email(smtp, to_addr, row)
                print(f"[{i}/{len(reader)}] Sent to {to_addr}")
                results.append({**row, "status": "sent", "error": ""})
            except Exception as e:
                print(f"[{i}/{len(reader)}] FAILED for {to_addr}: {e}")
                results.append({**row, "status": "failed", "error": str(e)})
            time.sleep(DELAY_SECONDS)

    # write log
    log_path = "send_log.csv"
    with open(log_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0].keys()))
        writer.writeheader()
        writer.writerows(results)

    sent = sum(1 for r in results if r["status"] == "sent")
    failed = sum(1 for r in results if r["status"] == "failed")
    print(f"\nDone. Sent: {sent}, Failed: {failed}")
    print(f"Full log written to {log_path}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 send_keys.py students.csv")
        sys.exit(1)
    main(sys.argv[1])