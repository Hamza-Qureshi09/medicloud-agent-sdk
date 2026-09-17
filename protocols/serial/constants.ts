/**
 * BioLabo Kenza "Custom String" protocol control codes (manual: Protocol Data Layer).
 *
 * Half-duplex framing over RS-232:
 *   - Sender sends ENQ, receiver replies ACK when ready (NAK if busy).
 *   - Sender sends one frame STX payload BCC ETX, receiver validates BCC
 *     and replies ACK (or NAK), then sender sends EOT.
 *
 * Both LIS and analyzer may initiate: the analyzer pushes results,
 * the LIS pushes orders.
 */
export const KENZA_CONTROL = {
	ENQ: 0x05, // Enquiry - initiates a transmission session, asks "are you ready?"

	ACK: 0x06, // Acknowledge - receiver accepts the ENQ or the last frame successfully

	NAK: 0x15, // Negative Acknowledge - receiver is busy (on ENQ) or BCC failed (on frame)

	EOT: 0x04, // End of Transmission - sender releases the link after the last frame is ACK'd

	STX: 0x02, // Start of Text - marks the beginning of a data frame

	ETX: 0x03, // End of Text - marks the end of a frame (BCC follows)

	ETB: 0x17, // End of Transmission Block - intermediate frame terminator (multi-block messages)
} as const;

/**
 * Fixed-width field sizes for the Id8/Id9 protocol variants (manual: String format).
 *
 * All fields are left-justified and space-padded to a fixed width with NO
 * separators between them:
 *   LIS -> Analyzer (order):  PatID(8/9) Name(30) Species(32) Test(3) x n
 *   Analyzer -> LIS (result): PatID(8/9) Name(30) Species(32) [Test(3) Result(9)] x n
 */
export const KENZA_ID9 = {
	PATIENT_ID: 9,
	PATIENT_NAME: 30,
	SPECIES: 32,
	TEST_NAME: 3,
	TEST_RESULT: 9,
} as const;

/** Id8 variant uses an 8-character patient ID field instead of 9. */
export const KENZA_ID8 = {
	...KENZA_ID9,
	PATIENT_ID: 8,
} as const;
