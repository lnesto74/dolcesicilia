import Tesseract from 'tesseract.js';
import { parseContactsFromOcrText } from '../../shared/parseContacts.js';

export async function extractContactsFromImage(buffer) {
  const { data } = await Tesseract.recognize(buffer, 'eng', {
    logger: () => {},
  });

  const contacts = parseContactsFromOcrText(data.text);
  return { text: data.text, contacts };
}
