/**
 * Shrinking a photo in the browser before it is sent (D94).
 *
 * A phone photo is several megabytes; the API keeps a 256px square. Sending
 * a 512px JPEG instead keeps the request inside the body limit (SEC-18) and
 * off a slow connection. The API decodes and re-encodes it anyway, so this
 * is a courtesy, never the check.
 */

const EDGE = 512;

/** The image as base64 JPEG, its longer edge at most 512px. */
export async function shrinkToBase64(file: File): Promise<string> {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, EDGE / Math.max(bitmap.width, bitmap.height));
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('NO_CANVAS');
	// A photo with transparency lands on white rather than black.
	context.fillStyle = '#ffffff';
	context.fillRect(0, 0, width, height);
	context.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
	return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
