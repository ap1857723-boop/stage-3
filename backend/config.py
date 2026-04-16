import os

# By default, the system acts dynamically inside MOCK Mode!
# To deploy to production, replace these with your literal Developer Accounts.
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "sk_test_replace_me")

SMTP_EMAIL = os.getenv("SMTP_EMAIL", "dummy@example.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "dummy_password")
