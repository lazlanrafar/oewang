# ponytail: duplicated from packages/constants/src/default/category.ts — keep in sync.
INCOME_CATEGORIES = [
    "💵 Salary",
    "💰 Allowance",
    "💵 Petty cash",
    "🏅 Bonus",
    "🐒 Chip in",
    "💰 Freelance",
    "Other",
]

EXPENSE_CATEGORIES = [
    "🍜 Food",
    "🧑‍🤝‍🧑 Social Life",
    "🐶 Pets",
    "🚕 Transport",
    "🪑 Household",
    "🧥 Apparel",
    "💄 Beauty",
    "🧘 Health",
    "📙 Education",
    "🎁 Gift",
    "⚽ Sport",
    "🧣 Laundry",
    "☕ Coffee",
    "💹 Investment",
    "🏡 Rent",
    "💸 Subscription",
    "🛵 Motorbikes",
    "🤖 Hobby",
    "💳 Credit",
    "📶 Internet",
    "🏡 Parents",
    "📚 Hobby",
    "💵 Salary",
    "Other",
]

ALL_CATEGORIES = list(dict.fromkeys(EXPENSE_CATEGORIES + INCOME_CATEGORIES))


def category_set() -> set[str]:
    return set(ALL_CATEGORIES)
