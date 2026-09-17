/**
 * Parses an inbound Kenza Id8/Id9 result payload into a MachineResultEvent.
 *
 * The serial result string carries only test name and numeric value. Reference
 * ranges and units are not present in the serial string mode, so every analyte
 * is reported as a quantitative (resultType "F") result. The catalog lookup
 * enriches the wire code with the human-readable assay name.
 */

import type { MachineResultEvent } from '../../types.ts';
import { decodeKenzaResult } from '../../protocols/serial/records.ts';
import { findKenzaAssay } from './catalog.ts';

/**
 * Parse a raw Kenza wire payload into a normalized MachineResultEvent.
 *
 * @param payload - raw string received between STX and BCC
 * @param patientIdWidth - 8 for Id8 variant, 9 for Id9 variant
 */
export function parseKenzaPayload(
	payload: string,
	patientIdWidth: 8 | 9,
): MachineResultEvent {
	const parsed = decodeKenzaResult(payload, { patientIdWidth });

	return {
		sampleId: parsed.patient_id,
		patientId: parsed.patient_id,
		payload: {
			results: parsed.results.map((r) => {
				const entry = findKenzaAssay(r.name);
				return {
					assayNo: entry?.code ?? r.name,
					assayName: entry?.name ?? r.name,
					resultType: 'F' as const,
					value: r.result,
				};
			}),
		},
		raw: payload,
		receivedAt: new Date(),
	};
}
