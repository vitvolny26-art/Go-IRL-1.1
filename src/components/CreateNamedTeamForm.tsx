import { useState, type FormEvent } from "react";
import type { Language } from "../types";

const copy: Record<Language, { placeholder: string; create: string; creating: string; required: string; failed: string }> = {
  ru: { placeholder: "Название команды", create: "Создать команду", creating: "Создание…", required: "Введите название от 1 до 80 символов", failed: "Не удалось создать команду" },
  uk: { placeholder: "Назва команди", create: "Створити команду", creating: "Створення…", required: "Введіть назву від 1 до 80 символів", failed: "Не вдалося створити команду" },
  en: { placeholder: "Team name", create: "Create team", creating: "Creating…", required: "Enter a name of 1 to 80 characters", failed: "Could not create team" },
  cs: { placeholder: "Název týmu", create: "Vytvořit tým", creating: "Vytváření…", required: "Zadejte název o délce 1 až 80 znaků", failed: "Tým se nepodařilo vytvořit" },
  pl: { placeholder: "Nazwa zespołu", create: "Utwórz zespół", creating: "Tworzenie…", required: "Podaj nazwę od 1 do 80 znaków", failed: "Nie udało się utworzyć zespołu" },
  sk: { placeholder: "Názov tímu", create: "Vytvoriť tím", creating: "Vytváranie…", required: "Zadajte názov od 1 do 80 znakov", failed: "Nepodarilo sa vytvoriť tím" },
};

export function CreateNamedTeamForm({ language, onCreate }: {
  language: Language;
  onCreate: (name: string) => Promise<void>;
}) {
  const labels = copy[language];
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 80) {
      setError(labels.required);
      return;
    }
    setPending(true);
    setError("");
    try {
      await onCreate(trimmed);
      setName("");
    } catch {
      setError(labels.failed);
    } finally {
      setPending(false);
    }
  };
  return (
    <form onSubmit={(event) => { void submit(event); }} style={{ display: "grid", gap: 12, marginTop: 16, width: "100%", minWidth: 0 }}>
      <input aria-label={labels.placeholder} value={name} maxLength={80} disabled={pending}
        onChange={(event) => setName(event.target.value)} placeholder={labels.placeholder} style={{ boxSizing: "border-box", width: "100%", minWidth: 0, padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.06)", color: "inherit", font: "inherit" }} />
      <button type="submit" disabled={pending || !name.trim()} style={{ justifySelf: "start", maxWidth: "100%", padding: "12px 18px", borderRadius: 12, border: "1px solid rgba(191,255,65,0.55)", background: "rgba(191,255,65,0.14)", color: "inherit", font: "inherit", fontWeight: 600, cursor: pending ? "wait" : "pointer", opacity: pending || !name.trim() ? 0.55 : 1 }}>{pending ? labels.creating : labels.create}</button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
