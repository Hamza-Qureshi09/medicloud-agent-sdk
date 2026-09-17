/**
 * BioLabo Kenza "Custom String" protocol checksum (manual: Checksum computation).
 *
 * CS(payload) = (sum of all payload bytes) mod 256
 * BCC = lowercase hex of CS, exactly 2 ASCII chars
 *
 * The payload is the whole message without STX, BCC and ETX.
 * Worked example from the manual: the "002 Garfield ... GL NA K" payload sums
 * to 5561, 5561 mod 256 = 185 = 0xb9, so BCC = "b9".
 */
export function computeKenzaBcc(payload: Uint8Array): string {
	let sum = 0;
	for (const byte of payload) {
		sum = (sum + byte) & 0xff;
	}
	return sum.toString(16).toLowerCase().padStart(2, '0');
}
