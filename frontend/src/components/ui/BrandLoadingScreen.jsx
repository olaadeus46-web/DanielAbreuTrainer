import './BrandLoadingScreen.css';

export default function BrandLoadingScreen({ fullscreen = false, small = true }) {
  const rootClassName = `da-loading-root ${fullscreen ? 'da-loading-fullscreen' : 'da-loading-inline'} ${small ? 'da-loading-small' : 'da-loading-large'}`;

  return (
    <div className={rootClassName} aria-label="A carregar" role="status">
      {fullscreen ? <div className="da-scanlines" /> : null}
      <div className="da-logo-wrap">
        <div className="da-glow-ring" />
        <div className="da-glow-ring" />
        <div className="da-glow-ring" />

        <svg className="da-logo-svg" viewBox="0 0 680 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <text className="da-letter-d" x="247" y="168" fontFamily="'Arial Black','Helvetica Neue',sans-serif" fontSize="172" fill="#000000" textAnchor="middle">D</text>
          <text className="da-letter-a" x="433" y="168" fontFamily="'Arial Black','Helvetica Neue',sans-serif" fontSize="172" fill="#000000" textAnchor="middle">A</text>

          <rect className="da-bar-left" x="84" y="94" width="256" height="15" rx="4" fill="#5682B1" />
          <rect className="da-bar-left" x="84" y="94" width="256" height="4" rx="2" fill="#739EC9" opacity="0.7" />
          <rect className="da-bar-right" x="340" y="94" width="256" height="15" rx="4" fill="#5682B1" />
          <rect className="da-bar-right" x="340" y="94" width="256" height="4" rx="2" fill="#739EC9" opacity="0.7" />
          <rect x="84" y="102" width="512" height="7" rx="3" fill="#000000" opacity="0.4" />

          <line x1="307" y1="97" x2="307" y2="109" stroke="#000000" strokeWidth="1.5" strokeOpacity="0.5" />
          <line x1="319" y1="97" x2="319" y2="109" stroke="#000000" strokeWidth="1.5" strokeOpacity="0.5" />
          <line x1="331" y1="97" x2="331" y2="109" stroke="#000000" strokeWidth="2" strokeOpacity="0.5" />
          <line x1="340" y1="97" x2="340" y2="109" stroke="#000000" strokeWidth="2.5" strokeOpacity="0.5" />
          <line x1="349" y1="97" x2="349" y2="109" stroke="#000000" strokeWidth="2" strokeOpacity="0.5" />
          <line x1="361" y1="97" x2="361" y2="109" stroke="#000000" strokeWidth="1.5" strokeOpacity="0.5" />
          <line x1="373" y1="97" x2="373" y2="109" stroke="#000000" strokeWidth="1.5" strokeOpacity="0.5" />

          <rect x="72" y="88" width="12" height="27" rx="2" fill="#739EC9" />
          <rect x="596" y="88" width="12" height="27" rx="2" fill="#739EC9" />

          <g className="da-plate-left">
            <rect x="54" y="47" width="18" height="109" rx="3" fill="#5682B1" />
            <rect x="54" y="47" width="18" height="109" rx="3" fill="none" stroke="#739EC9" strokeWidth="0.75" strokeOpacity="0.5" />
            <rect x="58" y="58" width="10" height="87" rx="2" fill="#000000" opacity="0.5" />
            <rect x="40" y="54" width="14" height="95" rx="3" fill="#5682B1" />
            <rect x="40" y="54" width="14" height="95" rx="3" fill="none" stroke="#739EC9" strokeWidth="0.75" strokeOpacity="0.5" />
            <rect x="44" y="64" width="6" height="75" rx="1.5" fill="#000000" opacity="0.5" />
          </g>

          <g className="da-plate-right">
            <rect x="608" y="47" width="18" height="109" rx="3" fill="#5682B1" />
            <rect x="608" y="47" width="18" height="109" rx="3" fill="none" stroke="#739EC9" strokeWidth="0.75" strokeOpacity="0.5" />
            <rect x="612" y="58" width="10" height="87" rx="2" fill="#000000" opacity="0.5" />
            <rect x="626" y="54" width="14" height="95" rx="3" fill="#5682B1" />
            <rect x="626" y="54" width="14" height="95" rx="3" fill="none" stroke="#739EC9" strokeWidth="0.75" strokeOpacity="0.5" />
            <rect x="630" y="64" width="6" height="75" rx="1.5" fill="#000000" opacity="0.5" />
          </g>
        </svg>
      </div>
    </div>
  );
}
