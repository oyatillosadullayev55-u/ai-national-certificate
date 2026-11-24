from ..schemas import StudentContext


def student_hint(student: StudentContext) -> str:
    """O'quvchi darajasiga moslashtirish bo'yicha qo'shimcha ko'rsatma."""
    if len(student.weakTopics) >= 3:
        return "- O'quvchida bir nechta bo'shliq bor: sodda tildan boshla, har qadamdan keyin tushunganini so'ra."
    return ""
