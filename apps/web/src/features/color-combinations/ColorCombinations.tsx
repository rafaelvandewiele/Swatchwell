import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useI18n } from '../../lib/i18n';
import {
  getFirstColourOptions,
  getMatchingShirtColours,
  getMatchingThirdColours,
  getApprovedCombinations,
  type FirstGarment,
  type GarmentColour,
} from './color-combinations';
import './ColorCombinations.css';

type Garment = 'upper' | 'shirt' | 'trousers';
type GarmentSvgs = Partial<Record<Garment, string>>;

const GARMENT_ASSETS: Record<Garment, string> = {
  upper: '/garments/bovenstuk.svg.gz',
  shirt: '/garments/shirt.svg.gz',
  trousers: '/garments/broek.svg.gz',
};

async function loadVector(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Unable to load garment vector: ${path}`);
  const compressed = await response.arrayBuffer();
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function GarmentPreview({ garment, colour, vectors }: { garment: Garment; colour: string; vectors: GarmentSvgs }) {
  const svg = vectors[garment];
  const markup = svg?.replaceAll('__GARMENT_COLOR__', colour);
  return (
    <div className={`colour-combination-garment colour-combination-garment--${garment}`} style={{ '--garment-colour': colour } as CSSProperties}>
      {markup ? (
        <div className="colour-combination-vector" dangerouslySetInnerHTML={{ __html: markup }} />
      ) : (
        <div className="colour-combination-vector-loading" aria-label="Loading garment illustration" />
      )}
    </div>
  );
}

function ColourChoice({ colour, selected, onSelect }: { colour: GarmentColour; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={`colour-choice ${selected ? 'is-selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="colour-choice-swatch" style={{ backgroundColor: colour.hex }} />
      <span className="colour-choice-name">{colour.name}</span>
      <span className="colour-choice-hex">{colour.hex}</span>
    </button>
  );
}

export default function ColorCombinations() {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [firstGarment, setFirstGarment] = useState<FirstGarment | null>(null);
  const [firstColour, setFirstColour] = useState<GarmentColour | null>(null);
  const [shirtColour, setShirtColour] = useState<GarmentColour | null>(null);
  const [thirdColour, setThirdColour] = useState<GarmentColour | null>(null);
  const [vectors, setVectors] = useState<GarmentSvgs>({});

  useEffect(() => {
    let active = true;
    void Promise.all(
      (Object.entries(GARMENT_ASSETS) as [Garment, string][]).map(async ([garment, path]) => {
        try {
          const svg = await loadVector(path);
          if (active) setVectors((current) => ({ ...current, [garment]: svg }));
        } catch (error) {
          console.error(error);
        }
      }),
    );
    return () => { active = false; };
  }, []);

  const firstOptions = useMemo(
    () => firstGarment ? getFirstColourOptions(firstGarment) : [],
    [firstGarment],
  );
  const shirtOptions = useMemo(
    () => firstGarment && firstColour ? getMatchingShirtColours(firstGarment, firstColour.hex) : [],
    [firstGarment, firstColour],
  );
  const thirdOptions = useMemo(
    () => firstGarment && firstColour && shirtColour
      ? getMatchingThirdColours(firstGarment, firstColour.hex, shirtColour.hex)
      : [],
    [firstGarment, firstColour, shirtColour],
  );
  const approved = useMemo(
    () => firstGarment && firstColour && shirtColour
      ? getApprovedCombinations(firstGarment, firstColour.hex, shirtColour.hex)
      : [],
    [firstGarment, firstColour, shirtColour],
  );

  const thirdGarment: Garment | null = firstGarment === 'upper' ? 'trousers' : firstGarment === 'trousers' ? 'upper' : null;
  const firstPreviewGarment: Garment | null = firstGarment;
  const currentGarment: Garment | null = step === 1 ? firstPreviewGarment : step === 2 ? 'shirt' : step === 3 ? thirdGarment : null;
  const currentColour = step === 1 ? firstColour : step === 2 ? shirtColour : step === 3 ? thirdColour : null;
  const currentOptions = step === 1 ? firstOptions : step === 2 ? shirtOptions : step === 3 ? thirdOptions : [];

  function chooseFirstGarment(value: FirstGarment) {
    setFirstGarment(value);
    setFirstColour(null);
    setShirtColour(null);
    setThirdColour(null);
    setStep(1);
  }

  function chooseFirstColour(value: GarmentColour) {
    setFirstColour(value);
    setShirtColour(null);
    setThirdColour(null);
    setStep(2);
  }

  function chooseShirtColour(value: GarmentColour) {
    setShirtColour(value);
    setThirdColour(null);
    setStep(3);
  }

  function reset() {
    setStep(0);
    setFirstGarment(null);
    setFirstColour(null);
    setShirtColour(null);
    setThirdColour(null);
  }

  function goBack() {
    if (step === 1) setStep(0);
    if (step === 2) { setStep(1); setShirtColour(null); setThirdColour(null); }
    if (step === 3) { setStep(2); setThirdColour(null); }
  }

  const firstLabel = firstGarment === 'upper' ? t('Upper layer') : t('Trousers');
  const thirdLabel = firstGarment === 'upper' ? t('Trousers') : t('Upper layer');

  return (
    <div className="page-content colour-combinations-page">
      <header className="colour-combinations-heading">
        <div>
          <div className="eyebrow">{t('CURATED COLOUR PAIRINGS')}</div>
          <h1>{t('Colour combinations')}</h1>
          <p>{t('Build a balanced outfit in three simple colour choices. Every option is part of a curated combination.')}</p>
        </div>
        <button type="button" className="colour-combinations-reset" onClick={reset}>{t('Start over')}</button>
      </header>

      <div className="colour-combinations-progress" aria-label={t('Progress')}>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={step >= index ? 'is-current' : ''}>
            <span>{index + 1}</span>
            <small>{[t('Garment'), t('First colour'), t('Shirt colour'), t('Final colour')][index]}</small>
          </div>
        ))}
      </div>

      <section className="colour-combinations-panel">
        <div className="colour-combinations-controls">
          <div className="colour-combinations-step-label">{t('STEP')} {step + 1} {t('OF')} 4</div>
          {step === 0 ? (
            <>
              <h2>{t('Which item would you like to start with?')}</h2>
              <p>{t('Choose an upper layer or a pair of trousers. You will complete the outfit with a shirt and the remaining item.')}</p>
              <div className="garment-start-options">
                <button type="button" onClick={() => chooseFirstGarment('upper')}>
                  <span className="garment-start-icon">01</span>
                  <strong>{t('Upper layer')}</strong>
                  <small>{t('Sweater, cardigan or blazer')}</small>
                </button>
                <button type="button" onClick={() => chooseFirstGarment('trousers')}>
                  <span className="garment-start-icon">02</span>
                  <strong>{t('Trousers')}</strong>
                  <small>{t('A tailored or casual pair')}</small>
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>{step === 1 ? t('Choose the first colour') : step === 2 ? t('Choose a matching shirt colour') : t('Complete the combination')}</h2>
              <p>
                {step === 1
                  ? t('Start with a colour you would like to wear. The next options are limited to combinations that work with it.')
                  : step === 2
                    ? t('These shirt colours have been selected to complement your first choice.')
                    : t('Choose the final colour. Every option below is documented as a complete, harmonious combination.')}
              </p>
              <div className="colour-choice-list">
                {currentOptions.map((colour) => (
                  <ColourChoice
                    key={colour.hex}
                    colour={colour}
                    selected={currentColour?.hex === colour.hex}
                    onSelect={() => {
                      if (step === 1) chooseFirstColour(colour);
                      else if (step === 2) chooseShirtColour(colour);
                      else setThirdColour(colour);
                    }}
                  />
                ))}
              </div>
              {step === 3 && thirdColour ? (
                <div className="approved-combination-note">
                  <strong>{t('A considered combination')}</strong>
                  <p>{approved.find((item) => (thirdGarment === 'upper' ? item.upper.hex : item.trousers.hex) === thirdColour.hex)?.note}</p>
                </div>
              ) : null}
            </>
          )}
          <div className="colour-combinations-actions">
            {step > 0 ? <button type="button" className="secondary-button" onClick={goBack}>{t('Previous')}</button> : null}
            {step === 3 && thirdColour ? <button type="button" className="primary-button" onClick={reset}>{t('Create another combination')} <span>↗</span></button> : null}
          </div>
        </div>

        <div className="colour-combinations-preview">
          <div className="colour-combinations-preview-header">
            <span>{t('OUTFIT PREVIEW')}</span>
            <small>{step === 0 ? t('Your selected pieces will appear here') : step === 3 && thirdColour ? t('Your complete combination') : t('Live colour preview')}</small>
          </div>
          {step === 0 ? (
            <div className="colour-combinations-placeholder">
              <span>SWATCHWELL</span>
              <p>{t('Choose your first garment to begin.')}</p>
            </div>
          ) : step === 3 && thirdColour && firstColour && shirtColour && firstGarment ? (
            <div className="complete-outfit-preview">
              <div className="complete-outfit-layer">
                <GarmentPreview garment="upper" colour={(firstGarment === 'upper' ? firstColour : thirdColour).hex} vectors={vectors} />
                <span>{t('Upper layer')}</span>
              </div>
              <div className="complete-outfit-layer">
                <GarmentPreview garment="shirt" colour={shirtColour.hex} vectors={vectors} />
                <span>{t('Shirt')}</span>
              </div>
              <div className="complete-outfit-layer">
                <GarmentPreview garment="trousers" colour={(firstGarment === 'trousers' ? firstColour : thirdColour).hex} vectors={vectors} />
                <span>{t('Trousers')}</span>
              </div>
            </div>
          ) : currentGarment && currentColour ? (
            <div className="single-garment-preview">
              <GarmentPreview garment={currentGarment} colour={currentColour.hex} vectors={vectors} />
              <div>
                <strong>{currentGarment === 'shirt' ? t('Shirt') : currentGarment === 'upper' ? t('Upper layer') : t('Trousers')}</strong>
                <span>{currentColour.name} · {currentColour.hex}</span>
              </div>
            </div>
          ) : (
            <div className="colour-combinations-placeholder">
              <span>SWATCHWELL</span>
              <p>{t('Select a colour to preview this garment.')}</p>
            </div>
          )}
          {step > 0 && firstColour ? (
            <div className="colour-combinations-selection-summary">
              <span>{t('FIRST CHOICE')}</span><strong>{firstLabel}: {firstColour.name}</strong>
              {shirtColour ? <><span>{t('SHIRT')}</span><strong>{shirtColour.name}</strong></> : null}
              {thirdColour ? <><span>{t('FINAL CHOICE')}</span><strong>{thirdLabel}: {thirdColour.name}</strong></> : null}
            </div>
          ) : null}
        </div>
      </section>
      <p className="colour-combinations-disclaimer">{t('Combinations are curated by Swatchwell and can be expanded in the colour-combination catalogue. The recommendations are styling guidance, not fixed rules.')}</p>
    </div>
  );
}
