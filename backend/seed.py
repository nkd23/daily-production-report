"""Seed initial data: admin accounts, one Tổ trưởng account per Executive,
and the real line -> executive assignments.

Usage: .venv/Scripts/python seed.py
Safe to re-run: skips rows whose username/line_number already exist.

NOTE: PU (PU1/PU2), Buyer[*], SAM, Target Output, Target EFF are not known
for the real lines yet, so lines are created with placeholder values
(PU1 / SAM 0 / Target 0). Go to "Cấu hình Line" (Thư ký/Sếp) to fill in the
real numbers per line.
[*] Buyer is no longer a fixed line attribute - Tổ trưởng enters it on every
submission instead (a line's buyer/style can change day to day).
"""

from app.database import SessionLocal
from app.models import Line, PuGroup, User, UserRole
from app.security import hash_password

# Tổ trưởng account per Executive. Username/password are placeholders -
# change them (or ask a Thư ký/Sếp to) before real use.
EXECUTIVES = {
    "Ms Thảo": ("to_thao", "Totruong@2026"),
    "Ms Hương": ("to_huong", "Totruong@2026"),
    "Ms Doan": ("to_doan", "Totruong@2026"),
    "Ms Phương": ("to_phuong", "Totruong@2026"),
    "Ms Huệ": ("to_hue", "Totruong@2026"),
}

# line_number -> executive_name
LINES = [
    ("01AB", "Ms Thảo"),
    ("02AB", "Ms Thảo"),
    ("03AB", "Ms Thảo"),
    ("04AB", "Ms Thảo"),
    ("05AB", "Ms Thảo"),
    ("06AB", "Ms Thảo"),
    ("07AB", "Ms Thảo"),
    ("08AB", "Ms Hương"),
    ("09AB", "Ms Hương"),
    ("10AB", "Ms Hương"),
    ("11AB", "Ms Hương"),
    ("12AB", "Ms Hương"),
    ("13AB", "Ms Hương"),
    ("14AB", "Ms Hương"),
    ("15AB", "Ms Hương"),
    ("16AB", "Ms Hương"),
    ("17AB", "Ms Hương"),
    ("18AB", "Ms Thảo"),
    ("19AB", "Ms Thảo"),
    ("20AB", "Ms Doan"),
    ("21AB", "Ms Doan"),
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
    ("40AB", "Ms Phương"),
    ("41AB", "Ms Hương"),
    ("42AB", "Ms Hương"),
    ("43AB", "Ms Huệ"),
    ("44AB", "Ms Thảo"),
    ("45AB", "Ms Phương"),
    ("47AB", "Ms Doan"),
]


def get_or_create_user(db, username, password, full_name, role):
    user = db.query(User).filter(User.username == username).first()
    if user:
        return user
    user = User(username=username, password_hash=hash_password(password), full_name=full_name, role=role)
    db.add(user)
    db.flush()
    return user


def get_or_create_line(db, line_number, executive_name, to_truong_user_id, display_order):
    line = db.query(Line).filter(Line.line_number == line_number).first()
    if line:
        return line
    line = Line(
        line_number=line_number,
        executive_name=executive_name,
        pu_group=PuGroup.PU1,
        sam=0,
        target_output=0,
        target_eff=0,
        to_truong_user_id=to_truong_user_id,
        display_order=display_order,
    )
    db.add(line)
    db.flush()
    return line


def main():
    db = SessionLocal()
    try:
        get_or_create_user(db, "sep", "sep123", "Giám Đốc Nhà Máy", UserRole.sep)
        get_or_create_user(db, "thuky", "thuky123", "Nguyễn Thị Thư Ký", UserRole.thu_ky)

        executive_user_ids = {}
        for executive_name, (username, password) in EXECUTIVES.items():
            user = get_or_create_user(db, username, password, executive_name, UserRole.to_truong)
            executive_user_ids[executive_name] = user.id
        db.commit()

        for order, (line_number, executive_name) in enumerate(LINES, start=1):
            get_or_create_line(db, line_number, executive_name, executive_user_ids[executive_name], order)
        db.commit()

        print("Seed OK.")
        print("\nTài khoản quản lý:")
        print("  sep / sep123        (Sếp)")
        print("  thuky / thuky123    (Thư ký)")
        print("\nTài khoản Tổ trưởng (theo Executive) - đổi mật khẩu trước khi dùng thật:")
        for executive_name, (username, password) in EXECUTIVES.items():
            n_lines = sum(1 for _, e in LINES if e == executive_name)
            print(f"  {username} / {password}   ({executive_name} - phụ trách {n_lines} line)")
        print(f"\nĐã tạo {len(LINES)} line. PU/SAM/Target còn là giá trị mặc định (0) -")
        print("vào màn hình 'Cấu hình Line' (đăng nhập thuky/sep) để điền số liệu thật.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
