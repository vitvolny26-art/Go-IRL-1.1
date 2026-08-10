import type { Language } from "../types";

export type FirstOnboardingCopy = {
  closeAria: string;
  title: string;
  description: string;
  name: string;
  username: string;
  adult: string;
  acceptTerms: string;
  terms: string;
  acceptPrivacy: string;
  privacy: string;
  saving: string;
  continue: string;
  backToEvent: string;
  displayNameError: string;
  reservedNicknameError: string;
  nicknameError: string;
  confirmationsError: string;
  authRequiredError: string;
  nicknameTakenError: string;
  saveError: string;
};

const copy: Record<Language, FirstOnboardingCopy> = {
  ru: {
    closeAria: "Вернуться к событию",
    title: "Завершите профиль",
    description: "Один экран — и можно создавать события, присоединяться, отправлять запросы и общаться в чате. Если закрыть окно, публичное событие останется доступно.",
    name: "Имя",
    username: "Имя пользователя",
    adult: "Подтверждаю, что мне 18 лет или больше.",
    acceptTerms: "Я принимаю",
    terms: "Условия",
    acceptPrivacy: "Я принимаю",
    privacy: "Политику конфиденциальности",
    saving: "Сохраняем…",
    continue: "Продолжить",
    backToEvent: "Назад к событию",
    displayNameError: "Имя должно содержать от 2 до 40 символов.",
    reservedNicknameError: "Это имя пользователя зарезервировано.",
    nicknameError: "Используйте 3–24 строчные латинские буквы, цифры или одиночные подчёркивания.",
    confirmationsError: "Подтвердите 18+, Условия и Политику конфиденциальности.",
    authRequiredError: "Требуется подтверждённая авторизация.",
    nicknameTakenError: "Это имя пользователя уже занято.",
    saveError: "Не удалось завершить регистрацию. Проверьте поля и попробуйте ещё раз.",
  },
  uk: {
    closeAria: "Повернутися до події",
    title: "Завершіть профіль",
    description: "Один екран — і можна створювати події, приєднуватися, надсилати запити та спілкуватися в чаті. Якщо закрити вікно, публічна подія залишиться доступною.",
    name: "Ім’я",
    username: "Ім’я користувача",
    adult: "Підтверджую, що мені 18 років або більше.",
    acceptTerms: "Я приймаю",
    terms: "Умови",
    acceptPrivacy: "Я приймаю",
    privacy: "Політику конфіденційності",
    saving: "Зберігаємо…",
    continue: "Продовжити",
    backToEvent: "Назад до події",
    displayNameError: "Ім’я має містити від 2 до 40 символів.",
    reservedNicknameError: "Це ім’я користувача зарезервовано.",
    nicknameError: "Використовуйте 3–24 малі латинські літери, цифри або одиночні підкреслення.",
    confirmationsError: "Підтвердьте 18+, Умови та Політику конфіденційності.",
    authRequiredError: "Потрібна підтверджена авторизація.",
    nicknameTakenError: "Це ім’я користувача вже зайняте.",
    saveError: "Не вдалося завершити реєстрацію. Перевірте поля та спробуйте ще раз.",
  },
  cs: {
    closeAria: "Vrátit se k události",
    title: "Dokončete profil",
    description: "Jedna obrazovka a můžete vytvářet události, přidávat se, posílat žádosti a chatovat. Po zavření zůstane veřejná událost dostupná.",
    name: "Jméno",
    username: "Uživatelské jméno",
    adult: "Potvrzuji, že mi je 18 let nebo více.",
    acceptTerms: "Souhlasím s",
    terms: "Podmínkami",
    acceptPrivacy: "Souhlasím se",
    privacy: "Zásadami ochrany osobních údajů",
    saving: "Ukládání…",
    continue: "Pokračovat",
    backToEvent: "Zpět k události",
    displayNameError: "Jméno musí mít 2–40 znaků.",
    reservedNicknameError: "Toto uživatelské jméno je vyhrazené.",
    nicknameError: "Použijte 3–24 malých latinských písmen, číslic nebo jednotlivých podtržítek.",
    confirmationsError: "Potvrďte věk 18+, Podmínky a Zásady ochrany osobních údajů.",
    authRequiredError: "Je vyžadováno ověřené přihlášení.",
    nicknameTakenError: "Toto uživatelské jméno je již obsazené.",
    saveError: "Registraci se nepodařilo dokončit. Zkontrolujte pole a zkuste to znovu.",
  },
  en: {
    closeAria: "Return to public event",
    title: "Finish your profile",
    description: "One screen, then you can create, join, request, and chat. Closing this keeps the public event view available.",
    name: "Name",
    username: "Username",
    adult: "I confirm I am 18 or older.",
    acceptTerms: "I accept the",
    terms: "Terms",
    acceptPrivacy: "I accept the",
    privacy: "Privacy Policy",
    saving: "Saving…",
    continue: "Continue",
    backToEvent: "Back to public event",
    displayNameError: "Display name must be 2–40 characters.",
    reservedNicknameError: "This username is reserved.",
    nicknameError: "Use 3–24 lowercase letters, numbers, or single underscores.",
    confirmationsError: "Confirm 18+, Terms, and Privacy to continue.",
    authRequiredError: "Trusted authentication is required.",
    nicknameTakenError: "That username is already taken.",
    saveError: "Could not complete onboarding. Please review the fields and retry.",
  },
};

export const getFirstOnboardingCopy = (language: Language) => copy[language];