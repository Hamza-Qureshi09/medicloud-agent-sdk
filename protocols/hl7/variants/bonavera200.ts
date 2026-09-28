import { MllpProtocol } from '../link.ts';

/** Bonavera 200 discards bytes outside MLLP frames as in the tested source link. */
export class Bonavera200Protocol extends MllpProtocol {
	protected override processUnframedInput(): Promise<void> {
		this.input.length = 0;
		return Promise.resolve();
	}
}
