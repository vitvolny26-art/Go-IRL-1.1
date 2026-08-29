/**
 * Installable Google Sheets on-form-submit trigger for GROOMING018.
 * Script Properties (server-side only): GO_IRL_TELEGRAM_BOT_TOKEN,
 * GO_IRL_OWNER_CHAT_ID, optional GO_IRL_ADMIN_ORIGIN.
 * The owner/admin chat is operational infrastructure, never the master's communication identity.
 */
function onBeautyMasterFormSubmit(event) {
  if (!event || !event.range) throw new Error('grooming018_missing_form_event');
  var sheet = event.range.getSheet();
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var requestIdColumn = header.indexOf('request_id') + 1;
  if (!requestIdColumn) throw new Error('grooming018_request_id_column_missing');
  var requestIdCell = sheet.getRange(event.range.getRow(), requestIdColumn);
  var requestId = String(requestIdCell.getDisplayValue() || '').trim();
  if (!requestId) {
    requestId = 'GROOMING018-' + Utilities.getUuid();
    requestIdCell.setValue(requestId);
  }
  if (!/^GROOMING018-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new Error('grooming018_invalid_request_id');
  }

  var properties = PropertiesService.getScriptProperties();
  var idempotencyKey = 'grooming018-alert:' + requestId;
  if (properties.getProperty(idempotencyKey) === 'sent') return;
  var token = properties.getProperty('GO_IRL_TELEGRAM_BOT_TOKEN');
  var chatId = properties.getProperty('GO_IRL_OWNER_CHAT_ID');
  var origin = properties.getProperty('GO_IRL_ADMIN_ORIGIN') || 'https://goirl.realitka.pp.ua';
  if (!token || !chatId) throw new Error('grooming018_telegram_config_missing');
  var adminUrl = origin.replace(/\/$/, '') + '/admin?beauty_request=' + encodeURIComponent(requestId);
  var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      chat_id: chatId,
      text: 'Новая заявка мастера GO IRL\n' + requestId,
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: 'Открыть точную заявку', url: adminUrl }]] }
    })
  });
  var payload = JSON.parse(response.getContentText() || '{}');
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || payload.ok !== true) {
    throw new Error('grooming018_telegram_alert_failed:' + response.getResponseCode());
  }
  properties.setProperty(idempotencyKey, 'sent');
}
