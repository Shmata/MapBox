import * as React from 'react';
import styles from './Map.module.scss';
import './MapStyle.module.scss';
import type { IMapProps } from './IMapProps';
import { initYnseMap } from './initYnseMap';
import { mapData, municipalBoundaries } from '../data';

const MAPBOX_TOKEN = 'Paste your Mapbox token here';

const Map: React.FC<IMapProps> = (props) => {
  const { hasTeamsContext, context, description, caption } = props;
  const [isMapOpen, setIsMapOpen] = React.useState(false);
  const [isMapInitialized, setIsMapInitialized] = React.useState(false);

  const checkNullEmptyOrUndefined = (value: string | undefined | null): boolean => {
    return value === null || value === undefined || value.trim() === '';
  };

  React.useEffect(() => {
    if (!isMapOpen || isMapInitialized) {
      return;
    }

    // Map initialization logic
    initYnseMap({
      mapboxToken: checkNullEmptyOrUndefined(description) ? MAPBOX_TOKEN : description,
      mapData,
      municipalBoundaries,
      assetsBaseUrl: context ? context.pageContext.web.absoluteUrl : '',
      mapContainer: 'map',
      context
    });

    setIsMapInitialized(true);
  }, [isMapOpen, isMapInitialized]);

  React.useEffect(() => {
    if (!isMapOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsMapOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isMapOpen]);

  const openMapModal = (): void => {
    setIsMapOpen(true);
  };

  const closeMapModal = (): void => {
    setIsMapOpen(false);
  };

  const onOverlayClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      closeMapModal();
    }
  };

  return (
    <section className={`${styles.map} ${hasTeamsContext ? styles.teams : ''}`}>
      <button type="button" className="ynse-show-map-btn" onClick={openMapModal}>
        {caption || 'Show Map'}
      </button>

      <div
        className={`ynse-map-modal${isMapOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="YNSE Infrastructure Map"
        aria-hidden={!isMapOpen}
        onClick={onOverlayClick}
      >
        <button type="button" className="ynse-map-close" onClick={closeMapModal}>
          Close
        </button>

        <section id="app" className="ynse-map-content">
          <aside id="panel">
            <div className="panel-header">
              <span className="panel-logo-line">YONGE NORTH</span>
              <span className="panel-logo-line">SUBWAY EXTENSION</span>
            </div>

            <div className="panel-scroll">
              <section className="panel-section panel-summary">
                <div className="panel-summary-text">
                  The Yonge North Subway Extension will bring subway service further into York Region, connecting communities in Markham, Richmond Hill, and Vaughan to Toronto&apos;s rapid transit network with five new stations and 8 km of new rail.
                </div>
              </section>

              <section className="panel-section">
                <h3 className="panel-section-title">General Information</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <div className="info-value">~8 km</div>
                    <div className="info-label">New Rail</div>
                  </div>
                  <div className="info-item">
                    <div className="info-value">5</div>
                    <div className="info-label">New Stations</div>
                  </div>
                  <div className="info-item">
                    <div className="info-value">94,100+</div>
                    <div className="info-label">Daily Boardings</div>
                  </div>
                  <div className="info-item">
                    <div className="info-value">22 min</div>
                    <div className="info-label">Time Saved</div>
                  </div>
                  <div className="info-item">
                    <div className="info-value">26,000+</div>
                    <div className="info-label">Residents Near Stations</div>
                  </div>
                  <div className="info-item">
                    <div className="info-value">22,900+</div>
                    <div className="info-label">Jobs Near Stations</div>
                  </div>
                  <div className="info-item">
                    <div className="info-value">4,800+ t</div>
                    <div className="info-label">GHG Reduced / Year</div>
                  </div>
                  <div className="info-item">
                    <div className="info-value">7</div>
                    <div className="info-label">Transit Connections</div>
                  </div>
                </div>
              </section>

              <section className="panel-section">
                <h3 className="panel-section-title">Contract Details</h3>
                <div id="accordion" className="accordion"></div>
              </section>
            </div>
          </aside>

          <div id="map-container">
            <div id="map"></div>
            <div id="legend">
              <h3>Contract</h3>
              <div className="legend-items">
                <label className="legend-item" data-layer="SRS">
                  <input type="checkbox" checked />
                  <span className="legend-icon legend-line" style={{ background: '#FBDB65' }}></span>
                  <span>SRS</span>
                </label>
                <label className="legend-item" data-layer="AT">
                  <input type="checkbox" checked />
                  <span className="legend-icon legend-line" style={{ background: '#FF8674' }}></span>
                  <span>AT</span>
                </label>
                <label className="legend-item" data-layer="FEW">
                  <input type="checkbox" checked />
                  <span className="legend-icon legend-line" style={{ background: '#8FD6BD' }}></span>
                  <span>FEW</span>
                </label>
              </div>
              <h3 style={{ marginTop: '14px' }}>Asset Type</h3>
              <div className="legend-items">
                <label className="legend-item" data-layer="stations">
                  <input type="checkbox" checked />
                  <span className="legend-badge legend-station-badge" style={{ background: '#FBDB65' }}>
                    <span className="station-bullseye"></span>
                  </span>
                  <span>Stations</span>
                </label>
                <label className="legend-item" data-layer="eeb">
                  <input type="checkbox" checked />
                  <span className="legend-badge" style={{ background: '#ef4444' }}>E</span>
                  <span>EEB</span>
                </label>
                <label className="legend-item" data-layer="cross_passages">
                  <input type="checkbox" checked />
                  <span className="legend-badge" style={{ background: '#22c55e' }}>CP</span>
                  <span>Cross Passages</span>
                </label>
                <label className="legend-item" data-layer="tpss">
                  <input type="checkbox" checked />
                  <span className="legend-badge legend-badge-sm" style={{ background: '#a855f7' }}>TPSS</span>
                  <span>TPSS</span>
                </label>
                <label className="legend-item" data-layer="headwalls">
                  <input type="checkbox" checked />
                  <span className="legend-badge" style={{ background: '#FF8674' }}>H</span>
                  <span>Headwalls</span>
                </label>
                <label className="legend-item" data-layer="civil_works">
                  <input type="checkbox" checked />
                  <span className="legend-badge legend-badge-sm" style={{ background: '#8FD6BD' }}>CW</span>
                  <span>Civil Works</span>
                </label>
                <label className="legend-item" data-layer="facilities">
                  <input type="checkbox" checked />
                  <span className="legend-badge" style={{ background: '#ec4899' }}>F</span>
                  <span>Facilities</span>
                </label>
              </div>
            </div>
            <button id="toggle-3d">3D</button>
            <div id="zoom-level"></div>
            <div id="timeline">
              <div className="timeline-header">
                <span className="timeline-title">Construction Timeline</span>
                <span id="timeline-date-display">All Completed</span>
              </div>
              <div className="timeline-track-wrap">
                <div className="timeline-track">
                  <div className="timeline-progress" id="timeline-progress"></div>
                </div>
                <input type="range" id="timeline-slider" min="0" max="1" step="0.001" value="1" />
              </div>
              <div className="timeline-ticks">
                <span>2024</span><span>2025</span><span>2026</span><span>2027</span>
                <span>2028</span><span>2029</span><span>2030</span><span>2031</span><span>2032</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
};

export default Map;
