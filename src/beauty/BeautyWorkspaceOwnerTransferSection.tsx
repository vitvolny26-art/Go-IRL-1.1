import { useState } from "react";
import type { Language } from "../types";
import {
  prepareBeautyWorkspaceOwnerTransfer,
  type PreparedBeautyWorkspaceOwnerTransfer,
} from "./beautyWorkspaceOwnerTransfer";

const copy: Record<Language, {
  title: string;
  hint: string;
  action: string;
  preparing: string;
  warning: string;
  copyLink: string;
  copiedLink: string;
  copyMessage: string;
  copiedMessage: string;
  error: string;
}> = {
  ru: { title: "Владелец кабинета", hint: "Передача не происходит сразу. Новый владелец сначала подтверждает свою Google-учётную запись, затем запрос утверждает суперадминистратор.", action: "Изменить владельца кабинета", preparing: "Готовим ссылку…", warning: "До подтверждения суперадмином кабинет остаётся вашим.", copyLink: "Скопировать ссылку", copiedLink: "Ссылка скопирована", copyMessage: "Скопировать сообщение", copiedMessage: "Сообщение скопировано", error: "Не удалось подготовить передачу кабинета." },
  uk: { title: "Власник кабінету", hint: "Передача не відбувається одразу. Новий власник спочатку підтверджує Google-акаунт, після чого запит затверджує суперадміністратор.", action: "Змінити власника кабінету", preparing: "Готуємо посилання…", warning: "До підтвердження суперадміном кабінет залишається вашим.", copyLink: "Скопіювати посилання", copiedLink: "Посилання скопійовано", copyMessage: "Скопіювати повідомлення", copiedMessage: "Повідомлення скопійовано", error: "Не вдалося підготувати передачу кабінету." },
  cs: { title: "Vlastník kabinetu", hint: "Převod není okamžitý. Nový vlastník nejprve potvrdí účet Google a poté žádost schválí superadmin.", action: "Změnit vlastníka kabinetu", preparing: "Připravujeme odkaz…", warning: "Do schválení superadminem zůstává kabinet váš.", copyLink: "Kopírovat odkaz", copiedLink: "Odkaz zkopírován", copyMessage: "Kopírovat zprávu", copiedMessage: "Zpráva zkopírována", error: "Převod kabinetu se nepodařilo připravit." },
  en: { title: "Workspace owner", hint: "Ownership is not transferred immediately. The new owner first verifies a Google account, then a superadmin approves the request.", action: "Change workspace owner", preparing: "Preparing link…", warning: "You remain the owner until the superadmin approves the transfer.", copyLink: "Copy link", copiedLink: "Link copied", copyMessage: "Copy message", copiedMessage: "Message copied", error: "Could not prepare the workspace transfer." },
};

export function BeautyWorkspaceOwnerTransferSection({ language }: { language: Language }) {
  const text = copy[language];
  const [prepared, setPrepared] = useState<PreparedBeautyWorkspaceOwnerTransfer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"" | "link" | "message">("");

  const prepare = async () => {
    if (!window.confirm(`${text.action}?\n\n${text.warning}`)) return;
    setBusy(true);
    setError("");
    setCopied("");
    try {
      setPrepared(await prepareBeautyWorkspaceOwnerTransfer());
    } catch {
      setError(text.error);
    } finally {
      setBusy(false);
    }
  };

  const copyValue = async (kind: "link" | "message") => {
    if (!prepared) return;
    await navigator.clipboard.writeText(kind === "link" ? prepared.claimUrl : prepared.candidateMessage);
    setCopied(kind);
  };

  return <section className="beauty-note beauty-owner-transfer-section">
    <strong>{text.title}</strong>
    <span>{text.hint}</span>
    {!prepared ? <button className="beauty-secondary" type="button" disabled={busy} onClick={() => void prepare()}>{busy ? text.preparing : text.action}</button> : null}
    {prepared ? <div className="beauty-stack">
      <span>{text.warning}</span>
      <small>{new Date(prepared.expiresAt).toLocaleString()}</small>
      <input readOnly value={prepared.claimUrl} aria-label={text.copyLink} />
      <div className="beauty-form-grid">
        <button className="beauty-secondary" type="button" onClick={() => void copyValue("link")}>{copied === "link" ? text.copiedLink : text.copyLink}</button>
        <button className="beauty-secondary" type="button" onClick={() => void copyValue("message")}>{copied === "message" ? text.copiedMessage : text.copyMessage}</button>
      </div>
    </div> : null}
    {error ? <span role="alert">{error}</span> : null}
  </section>;
}
