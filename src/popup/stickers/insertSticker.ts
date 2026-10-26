import { sendMessageToActiveTab } from '../../utils/tools';

type InsertStickerOptions = {
  onUnavailable?: (message: string) => void;
};

export async function insertSticker(src: string, options: InsertStickerOptions = {}) {
  const copyWithNotice = async () => {
    try {
      await navigator.clipboard?.writeText(src);
    } catch (e) {
      // ignore clipboard errors; notify anyway
    } finally {
      options.onUnavailable?.('Формы ответа нет на странице. Прямая ссылка на картинку скопирована в буфер обмена.');
    }
  };

  try {
    const resp = await sendMessageToActiveTab({
      type: 'tundra_toolkit_insert_sticker',
      src,
    });
    if (!resp?.success) await copyWithNotice();
  } catch (e) {
    await copyWithNotice();
  }
}
