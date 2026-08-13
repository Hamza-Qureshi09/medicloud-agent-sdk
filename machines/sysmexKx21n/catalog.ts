/** CBC parameter catalog for Sysmex KX-21 / KX-21N host output. */

export interface SysmexKx21nCatalogEntry {
    readonly code: string;
    readonly name: string;
    readonly unit: string;
    readonly lowReference?: string;
    readonly highReference?: string;
    readonly category: string;
    readonly decimals: number;
}

export const SYSMEX_KX21N_MODELS = [
    'Sysmex KX-21N',
    // 'Sysmex KX-21',
    // 'KX-21N',
    // 'KX-21',
] as const;

export const SYSMEX_KX21N_CATALOG: readonly SysmexKx21nCatalogEntry[] = [
    entry('WBC', 'White Blood Cells', '10^3/uL', '4.0', '10.0', 'WBC', 1),
    entry('RBC', 'Red Blood Cells', '10^6/uL', '4.0', '5.5', 'RBC', 2),
    entry('HGB', 'Hemoglobin', 'g/dL', '12.0', '17.0', 'RBC', 1),
    entry('HCT', 'Hematocrit', '%', '36.0', '50.0', 'RBC', 1),
    entry(
        'MCV',
        'Mean Corpuscular Volume',
        'fL',
        '80.0',
        '100.0',
        'RBC Indices',
        1,
    ),
    entry(
        'MCH',
        'Mean Corpuscular Hemoglobin',
        'pg',
        '27.0',
        '34.0',
        'RBC Indices',
        1,
    ),
    entry(
        'MCHC',
        'Mean Corpuscular Hb Concentration',
        'g/dL',
        '32.0',
        '36.0',
        'RBC Indices',
        1,
    ),
    entry('PLT', 'Platelet Count', '10^3/uL', '150', '400', 'Platelet', 0),
    entry(
        'LYM%',
        'Lymphocyte Percentage',
        '%',
        '20.0',
        '40.0',
        'WBC Differential',
        1,
    ),
    entry(
        'MXD%',
        'Mixed Cell Percentage',
        '%',
        '3.0',
        '14.0',
        'WBC Differential',
        1,
    ),
    entry(
        'NEUT%',
        'Neutrophil Percentage',
        '%',
        '50.0',
        '70.0',
        'WBC Differential',
        1,
    ),
    entry(
        'LYM#',
        'Lymphocyte Count',
        '10^3/uL',
        '1.0',
        '3.5',
        'WBC Differential',
        1,
    ),
    entry(
        'MXD#',
        'Mixed Cell Count',
        '10^3/uL',
        '0.1',
        '1.4',
        'WBC Differential',
        1,
    ),
    entry(
        'NEUT#',
        'Neutrophil Count',
        '10^3/uL',
        '2.0',
        '7.0',
        'WBC Differential',
        1,
    ),
    entry(
        'RDW',
        'Red Cell Distribution Width',
        '%',
        '11.0',
        '16.0',
        'RBC Indices',
        1,
    ),
    entry(
        'RDW-SD',
        'Red Cell Distribution Width SD',
        'fL',
        '35.0',
        '56.0',
        'RBC Indices',
        1,
    ),
    entry(
        'RDW-CV',
        'Red Cell Distribution Width CV',
        '%',
        '11.0',
        '16.0',
        'RBC Indices',
        1,
    ),
    entry(
        'PDW',
        'Platelet Distribution Width',
        'fL',
        '9.0',
        '17.0',
        'Platelet',
        1,
    ),
    entry('MPV', 'Mean Platelet Volume', 'fL', '7.0', '11.0', 'Platelet', 1),
    entry(
        'P-LCR',
        'Platelet Large Cell Ratio',
        '%',
        '13.0',
        '43.0',
        'Platelet',
        1,
    ),
]

function entry(
    code: string,
    name: string,
    unit: string,
    lowReference: string,
    highReference: string,
    category: string,
    decimals: number,
): SysmexKx21nCatalogEntry {
    return {
        code,
        name,
        unit,
        lowReference,
        highReference,
        category,
        decimals,
    };
}

export function findSysmexKx21nAnalyte(
    code: string,
): SysmexKx21nCatalogEntry | undefined {
    return SYSMEX_KX21N_CATALOG.find((entry) => entry.code === code);
}