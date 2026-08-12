"""Seed initial demo data: one account per role + a handful of lines.

Usage: .venv/Scripts/python seed.py
Safe to re-run: skips rows whose username/line_number already exist.
"""

from app.database import SessionLocal
from app.models import Line, PuGroup, User, UserRole
from app.security import hash_password


def get_or_create_user(db, username, password, full_name, role):
    user = db.query(User).filter(User.username == username).first()
    if user:
        return user
    user = User(username=username, password_hash=hash_password(password), full_name=full_name, role=role)
    db.add(user)
    db.flush()
    return user


def get_or_create_line(db, **kwargs):
    line = db.query(Line).filter(Line.line_number == kwargs["line_number"]).first()
    if line:
        return line
    line = Line(**kwargs)
    db.add(line)
    db.flush()
    return line


def main():
    db = SessionLocal()
    try:
        sep = get_or_create_user(db, "sep", "sep123", "Giám Đốc Nhà Máy", UserRole.sep)
        thu_ky = get_or_create_user(db, "thuky", "thuky123", "Nguyễn Thị Thư Ký", UserRole.thu_ky)
        tt_thao = get_or_create_user(db, "totruong1", "tt123", "Trần Văn A (Line 1-2)", UserRole.to_truong)
        tt_huong = get_or_create_user(db, "totruong2", "tt123", "Lê Thị B (Line 3-4)", UserRole.to_truong)
        tt_doan = get_or_create_user(db, "totruong3", "tt123", "Phạm Văn C (Line 5)", UserRole.to_truong)
        db.commit()

        get_or_create_line(
            db, line_number="Line 1", executive_name="Ms Thảo", pu_group=PuGroup.PU1, buyer="Nike",
            sam=12.5, target_output=1200, target_eff=85, to_truong_user_id=tt_thao.id, display_order=1,
        )
        get_or_create_line(
            db, line_number="Line 2", executive_name="Ms Thảo", pu_group=PuGroup.PU1, buyer="Nike",
            sam=13.0, target_output=1100, target_eff=85, to_truong_user_id=tt_thao.id, display_order=2,
        )
        get_or_create_line(
            db, line_number="Line 3", executive_name="Ms Hương", pu_group=PuGroup.PU1, buyer="Adidas",
            sam=10.8, target_output=1300, target_eff=88, to_truong_user_id=tt_huong.id, display_order=3,
        )
        get_or_create_line(
            db, line_number="Line 4", executive_name="Ms Hương", pu_group=PuGroup.PU2, buyer="Adidas",
            sam=11.2, target_output=1250, target_eff=88, to_truong_user_id=tt_huong.id, display_order=4,
        )
        get_or_create_line(
            db, line_number="Line 5", executive_name="Ms Doan", pu_group=PuGroup.PU2, buyer="Puma",
            sam=14.0, target_output=1000, target_eff=80, to_truong_user_id=tt_doan.id, display_order=5,
        )
        db.commit()
        print("Seed OK. Tài khoản demo:")
        print("  sep / sep123        (Sếp)")
        print("  thuky / thuky123    (Thư ký)")
        print("  totruong1 / tt123   (Tổ trưởng - Line 1, 2)")
        print("  totruong2 / tt123   (Tổ trưởng - Line 3, 4)")
        print("  totruong3 / tt123   (Tổ trưởng - Line 5)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
