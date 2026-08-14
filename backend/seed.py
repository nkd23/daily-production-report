"""Seed initial data: admin accounts, real line -> executive assignments,
and one Tổ trưởng login per line (shared by whoever works Ca 1 or Ca 2 on
that line - the entry form has a Ca 1 / Ca 2 tab to enter either shift).

Usage: .venv/Scripts/python seed.py
Safe to re-run: skips rows whose username/line_number already exist.

NOTE: PU (PU1/PU2), SAM, Target Output, Target EFF are not known for the real
lines yet, so lines are created with placeholder values (PU1 / 0). Go to
"Cấu hình Line" (Thư ký/Sếp) to fill in the real numbers per line.
Buyer is not a line attribute at all - Tổ trưởng enters it on every
submission instead (a line's buyer/style can change day to day).
"""

from app.database import SessionLocal
from app.models import Line, PuGroup, User, UserRole
from app.security import hash_password

DEFAULT_PASSWORD = "Totruong@2026"

# line_number -> executive_name (report grouping label, not a login account)
# NOTE: trimmed to only the lines that currently appear in the factory's daily
# report (33 lines) - the rest were placeholder/test lines not in use yet.
LINES = [
    ("03AB", "Ms Thảo"),
    ("04AB", "Ms Thảo"),
    ("05AB", "Ms Thảo"),
    ("06AB", "Ms Thảo"),
    ("07AB", "Ms Thảo"),
    ("08AB", "Ms Thảo"),
    ("18AB", "Ms Thảo"),
    ("09AB", "Ms Hương"),
    ("10AB", "Ms Hương"),
    ("11AB", "Ms Hương"),
    ("12AB", "Ms Hương"),
    ("13AB", "Ms Hương"),
    ("14AB", "Ms Hương"),
    ("15AB", "Ms Hương"),
    ("16AB", "Ms Hương"),
    ("17AB", "Ms Hương"),
    ("23AB", "Ms Doan"),
    ("24AB", "Ms Doan"),
    ("25AB", "Ms Doan"),
    ("26AB", "Ms Doan"),
    ("27AB", "Ms Doan"),
    ("28AB", "Ms Doan"),
    ("29AB", "Ms Doan"),
    ("30AB", "Ms Doan"),
    ("31AB", "Ms Doan"),
    ("32AB", "Ms Phương"),
    ("33AB", "Ms Phương"),
    ("34AB", "Ms Phương"),
    ("35AB", "Ms Phương"),
    ("36AB", "Ms Phương"),
    ("37AB", "Ms Phương"),
    ("38AB", "Ms Phương"),
    ("39AB", "Ms Phương"),
]


def get_or_create_user(db, username, password, full_name, role):
    user = db.query(User).filter(User.username == username).first()
    if user:
        return user
    user = User(username=username, password_hash=hash_password(password), full_name=full_name, role=role)
    db.add(user)
    db.flush()
    return user


def line_username(line_number: str) -> str:
    return line_number.lower()


def main():
    db = SessionLocal()
    try:
        get_or_create_user(db, "sep", "sep123", "Giám Đốc Nhà Máy", UserRole.sep)
        get_or_create_user(db, "thuky", "thuky123", "Nguyễn Thị Thư Ký", UserRole.thu_ky)

        for order, (line_number, executive_name) in enumerate(LINES, start=1):
            to_truong = get_or_create_user(
                db,
                line_username(line_number),
                DEFAULT_PASSWORD,
                f"Tổ trưởng {line_number}",
                UserRole.to_truong,
            )
            db.flush()

            line = db.query(Line).filter(Line.line_number == line_number).first()
            if line is None:
                line = Line(
                    line_number=line_number,
                    executive_name=executive_name,
                    pu_group=PuGroup.PU1,
                    sam=0,
                    target_output=0,
                    target_eff=0,
                    to_truong_user_id=to_truong.id,
                    display_order=order,
                )
                db.add(line)

        db.commit()

        print("Seed OK.")
        print("\nTài khoản quản lý:")
        print("  sep / sep123        (Sếp)")
        print("  thuky / thuky123    (Thư ký)")
        print(f"\nĐã tạo {len(LINES)} line, mỗi line có 1 tài khoản Tổ trưởng dùng chung cho cả Ca 1 và Ca 2")
        print(f"(trong màn hình nhập liệu có tab để chuyển Ca 1 / Ca 2).")
        print(f"Mật khẩu mặc định cho TẤT CẢ tài khoản Tổ trưởng: {DEFAULT_PASSWORD}")
        print("Tên đăng nhập = số line viết thường. Ví dụ line 01AB:")
        print(f"  {line_username('01AB')} / {DEFAULT_PASSWORD}")
        print("\nCòn thiếu, cần Thư ký/Sếp vào 'Cấu hình Line' để điền số liệu thật:")
        print("  PU1/PU2, SAM, Target Output, Target EFF cho từng line.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
