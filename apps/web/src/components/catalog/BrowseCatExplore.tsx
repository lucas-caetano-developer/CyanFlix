import { Link } from 'react-router-dom';

export function BrowseCatExplore() {
  return (
    <section className="browse-cat-explore" aria-label="Explorar biblioteca completa">
      <div className="browse-cat-explore__illustration">
        <svg
          viewBox="0 0 320 150"
          width="300"
          height="140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Ground soft shadow */}
          <ellipse cx="160" cy="132" rx="120" ry="12" fill="rgba(0, 0, 0, 0.45)" />

          {/* Cozy Blanket / Bag wrapped around the sleeping cat */}
          <path
            d="M72 126C62 115 58 100 66 86C78 68 102 62 128 65C144 54 165 52 186 61C204 54 224 59 236 72C250 88 244 115 228 126C212 134 85 134 72 126Z"
            fill="#e2f5fb"
            stroke="#7dd3fc"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />

          {/* Blanket creases / folds */}
          <path d="M128 66C136 79 144 98 150 126" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M185 62C188 76 192 101 192 126" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M85 92C98 100 115 106 130 108" stroke="#bae6fd" strokeWidth="2" strokeLinecap="round" />
          <path d="M208 88C222 96 232 108 236 118" stroke="#bae6fd" strokeWidth="2" strokeLinecap="round" />

          {/* Cat Body & Head (Curled up asleep, peeking right) */}
          <ellipse cx="204" cy="104" rx="46" ry="26" fill="#0c2333" stroke="#00d4ff" strokeWidth="2" />

          {/* Left Cat Ear */}
          <path
            d="M178 88L166 56C164 53 169 50 172 53L194 80Z"
            fill="#0c2333"
            stroke="#00d4ff"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {/* Cyan inner ear glow */}
          <path d="M171 61L180 77L186 79" fill="#00d4ff" opacity="0.85" />
          {/* Orange ear tip accent (matching the anime reference) */}
          <path d="M168 59L166 56C164 53 169 50 172 53L175 58Z" fill="#ff640a" />

          {/* Right Cat Ear */}
          <path
            d="M216 82L234 54C236 51 241 53 239 57L231 87Z"
            fill="#0c2333"
            stroke="#00d4ff"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {/* Cyan inner ear glow */}
          <path d="M231 59L226 77L220 80" fill="#00d4ff" opacity="0.85" />
          {/* Orange ear tip accent */}
          <path d="M232 57L234 54C236 51 241 53 239 57L237 60Z" fill="#ff640a" />

          {/* Cute Little Cyan Paws peeking from blanket */}
          <ellipse cx="168" cy="124" rx="10" ry="7" fill="#00d4ff" />
          <ellipse cx="188" cy="126" rx="10" ry="7" fill="#00d4ff" />
          <line x1="165" y1="125" x2="165" y2="128" stroke="#083344" strokeWidth="1.8" />
          <line x1="185" y1="127" x2="185" y2="130" stroke="#083344" strokeWidth="1.8" />

          {/* Cute Tail peeking from blanket on the left */}
          <path
            d="M68 102C56 104 46 112 48 120C50 126 60 124 72 122"
            fill="none"
            stroke="#0c2333"
            strokeWidth="9"
            strokeLinecap="round"
          />
          {/* Cyan tail tip */}
          <path
            d="M48 120C50 126 55 125 62 123"
            fill="none"
            stroke="#00d4ff"
            strokeWidth="6"
            strokeLinecap="round"
          />

          {/* Sleepy Eyes (peaceful curved closed eye arcs in vibrant cyan) */}
          <path d="M190 102C193 105 198 105 201 102" stroke="#00d4ff" strokeWidth="3" strokeLinecap="round" />
          <path d="M218 101C221 104 226 104 229 101" stroke="#00d4ff" strokeWidth="3" strokeLinecap="round" />

          {/* Cute Little Mouth (peaceful sleeping line with sweet tongue peek) */}
          <path d="M208 110C209 113 213 113 214 110Z" fill="#ff640a" stroke="#ffedd5" strokeWidth="1" />

          {/* Soft Cyan Cheek Blushes */}
          <ellipse cx="184" cy="107" rx="6" ry="3.5" fill="#00d4ff" opacity="0.4" />
          <ellipse cx="233" cy="106" rx="6" ry="3.5" fill="#00d4ff" opacity="0.4" />
        </svg>
      </div>

      <h2 className="browse-cat-explore__title">Ainda procurando algo para assistir?</h2>
      <p className="browse-cat-explore__subtitle">Confira nossa biblioteca completa</p>

      <Link to="/browse?kind=anime" className="browse-cat-explore__btn">
        VER TUDO
      </Link>
    </section>
  );
}
