import { MllpProtocol } from '../link.ts';

/** Count discards bytes outside MLLP frames as in the tested source link. */
export class BonaveraCountProtocol extends MllpProtocol {
	protected override processUnframedInput(): Promise<void> {
		this.input.length = 0;
		return Promise.resolve();
	}
}
