"""Independent monthly pivot of the sales export, for checking the app to the cent.

Sums Total Price by Invoice Date month over Invoice and Credit Invoice rows,
the same way an Excel pivot of the file would.
Usage: python3 verify/monthly_pivot.py Sales_Master.csv
"""
import csv
import sys
from collections import defaultdict
from datetime import datetime
from decimal import Decimal

totals = defaultdict(Decimal)
rows = 0
with open(sys.argv[1], encoding="utf-8-sig", newline="") as f:
    for row in csv.DictReader(f):
        rows += 1
        if row["Invoice Type"] in ("Invoice", "Credit Invoice"):
            month = datetime.strptime(row["Invoice Date"], "%m/%d/%y").strftime("%Y-%m")
            totals[month] += Decimal(row["Total Price"].replace(",", "").replace("$", ""))

print(f"data rows: {rows}", file=sys.stderr)
for month in sorted(totals):
    print(f"{month}|{totals[month].quantize(Decimal('0.01'))}")
