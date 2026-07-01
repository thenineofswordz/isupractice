import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, AttributionControl } from 'react-leaflet';
import Papa from 'papaparse';
import 'leaflet/dist/leaflet.css';
import './App.css';

import pointsCsvUrl from './assets/points.csv?url';
import regionsCsvUrl from './assets/regions.csv?url';
import irkutskGeoJsonUrl from './assets/MO_Irk_region_4326.geojson?url';
import popularityCsvUrl from './assets/popularity.csv?url';

const CATEGORY_COLORS = {
  'Активный туризм': '#FF6B35',
  'Лечебно-оздоровительный туризм': '#00B4D8',
  'Культурно-познавательный туризм': '#7B2FBE',
  'Развлекательный туризм': '#FF006E',
  'Сельский туризм': '#2D6A4F',
  'Природный туризм': '#06D6A0',
  'Религиозный туризм': '#F4A261',
  'Деловой туризм': '#264653',
  'Промышленный туризм': '#E76F51',
  'Событийный туризм': '#E63946',
};

const HEATMAP_COLORS = [
  '#f7f7f7', '#e8e8e8', '#d9d9d9', '#cacaca', '#bbbbbb',
  '#ababab', '#9c9c9c', '#8d8d8d', '#7e7e7e', '#6f6f6f',
  '#606060', '#515151', '#424242', '#333333', '#242424',
  '#151515', '#000000'
];

const CATEGORY_MAP = {
  'Активный туризм': ['активный', 'активный водный', 'активный (рафтинг)', 'активный (горнолыжный, горный, пеший, лыжный, водный)', 'парусный', 'водный', 'рафтинг', 'горнолыжный', 'горный', 'спортивный', 'охотничий', 'экстремальный', 'приключенческий'],
  'Лечебно-оздоровительный туризм': ['лечебно-оздоровительный', 'оздоровительный'],
  'Культурно-познавательный туризм': ['познавательный', 'культурный', 'этнографический', 'исторический'],
  'Развлекательный туризм': ['развлекательный', 'событийный', 'фестивальный', 'шоу'],
  'Сельский туризм': ['сельский', 'агротуризм'],
  'Природный туризм': ['экологический', 'эко', 'природный', 'этноэкологический', 'сакральный'],
  'Религиозный туризм': ['религиозный', 'паломнический'],
  'Деловой туризм': ['деловой', 'бизнес', 'конгрессный'],
  'Промышленный туризм': ['промышленный', 'индустриальный'],
  'Событийный туризм': ['событийный'],
};

const findCategory = (tourismTypes) => {
  if (!tourismTypes || tourismTypes.length === 0) return null;
  
  for (const type of tourismTypes) {
    if (CATEGORY_MAP[type]) {
      return type;
    }
  }
  
  for (const type of tourismTypes) {
    const lowerType = type.toLowerCase().trim();
    for (const [category, keywords] of Object.entries(CATEGORY_MAP)) {
      if (keywords.some(keyword => lowerType.includes(keyword) || keyword.includes(lowerType))) {
        return category;
      }
    }
  }
  
  return null;
};

const createPieChart = (data, colors, width = 150, height = 150) => {
  const total = Object.values(data).reduce((sum, val) => sum + val, 0);
  if (total === 0) return '<div style="text-align:center;color:#999;font-size:12px;">Нет данных</div>';
  
  const radius = Math.min(width, height) / 2 - 10;
  const centerX = width / 2;
  const centerY = height / 2;
  
  let startAngle = -Math.PI / 2;
  let svgPaths = '';
  let legendHtml = '';
  
  const entries = Object.entries(data).filter(([_, value]) => value > 0);
  
  entries.forEach(([category, value]) => {
    const percentage = (value / total) * 100;
    const angle = (value / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    
    const x1 = centerX + radius * Math.cos(startAngle);
    const y1 = centerY + radius * Math.sin(startAngle);
    const x2 = centerX + radius * Math.cos(endAngle);
    const y2 = centerY + radius * Math.sin(endAngle);
    
    const largeArc = angle > Math.PI ? 1 : 0;
    
    const path = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    
    const color = colors[category] || '#cccccc';
    svgPaths += `<path d="${path}" fill="${color}" stroke="#fff" stroke-width="1.5" />`;
    
    legendHtml += `
      <div style="display:flex;align-items:center;margin:2px 0;font-size:11px;">
        <span style="display:inline-block;width:12px;height:12px;background:${color};border-radius:50%;margin-right:6px;"></span>
        <span>${category}: ${percentage.toFixed(1)}% (${value})</span>
      </div>
    `;
    
    startAngle = endAngle;
  });
  
  return `
    <div style="display:flex;flex-direction:column;align-items:center;">
      <svg width="${width}" height="${height}" style="max-width:100%;">
        ${svgPaths}
        <text x="${centerX}" y="${centerY + 5}" text-anchor="middle" font-size="12" fill="#666" font-weight="bold">
          ${total}
        </text>
      </svg>
      <div style="margin-top:8px;width:100%;max-height:120px;overflow-y:auto;font-size:11px;">
        ${legendHtml}
      </div>
    </div>
  `;
};

const normalizeName = (name) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/муниципальный\s*/g, '')
    .replace(/муниципальное\s*/g, '')
    .replace(/образование\s*/g, '')
    .replace(/городской\s*/g, '')
    .replace(/сельский\s*/g, '')
    .replace(/поселение\s*/g, '')
    .replace(/район\s*/g, '')
    .replace(/округ\s*/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

function App() {
  const [placesData, setPlacesData] = useState([]);
  const [regionsData, setRegionsData] = useState([]);
  const [popularityData, setPopularityData] = useState({});
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState(null);
  const [showPolygons, setShowPolygons] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [viewMode, setViewMode] = useState('tourism');
  const [quantMetric, setQuantMetric] = useState('places');

  useEffect(() => {
    if (viewMode === 'quantitative') {
      setSelectedCategory(null);
    }
  }, [viewMode]);

  useEffect(() => {
    const loadAllData = async () => {
      try {
        const geoResponse = await fetch(irkutskGeoJsonUrl);
        if (!geoResponse.ok) throw new Error("Не найден файл GeoJSON");
        const geoJson = await geoResponse.json();
        setGeoJsonData(geoJson);

        const pointsResponse = await fetch(pointsCsvUrl);
        const pointsText = await pointsResponse.text();
        const parsedPoints = Papa.parse(pointsText, { 
          header: true, 
          skipEmptyLines: true 
        }).data;
        setPlacesData(parsedPoints);

        const regionsResponse = await fetch(regionsCsvUrl);
        const regionsText = await regionsResponse.text();
        const parsedRegions = Papa.parse(regionsText, { 
          header: true, 
          delimiter: ";", 
          skipEmptyLines: true 
        }).data;
        setRegionsData(parsedRegions);

        const popularityResponse = await fetch(popularityCsvUrl);
        const popularityText = await popularityResponse.text();
        const parsedPopularity = Papa.parse(popularityText, { 
          header: true, 
          skipEmptyLines: true 
        }).data;
        
        const popularityMap = {};
        parsedPopularity.forEach(row => {
          const region = row['region']?.trim();
          const popularity = parseInt(row['popularity']) || 0;
          if (region) {
            popularityMap[region] = popularity;
          }
        });
        setPopularityData(popularityMap);

        setIsLoading(false);
      } catch (error) {
        setErrorStatus(error.message);
        setIsLoading(false);
      }
    };
    loadAllData();
  }, []);

  const categoryCounts = useMemo(() => {
    const counts = {};
    placesData.forEach(place => {
      const cat = place.agr_type;
      if (cat) {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    });
    return counts;
  }, [placesData]);

  const tourismColors = useMemo(() => {
    const uniqueCats = [...new Set(placesData.map(p => p.agr_type).filter(Boolean))];
    const mapping = {};
    uniqueCats.forEach((cat) => {
      mapping[cat] = CATEGORY_COLORS[cat] || '#cccccc';
    });
    return mapping;
  }, [placesData]);

  const regionStats = useMemo(() => {
    if (!placesData.length || !regionsData.length) return {};
    
    const stats = {};
    
    placesData.forEach(place => {
      if (!place.lat || !place.lon) return;
      const lat = parseFloat(place.lat.toString().replace(',', '.'));
      const lon = parseFloat(place.lon.toString().replace(',', '.'));
      if (isNaN(lat) || isNaN(lon)) return;
      
      const regionName = place['region (test_copies_deleted_6.csv1)'] || '';
      if (!regionName) return;
      
      const category = place.agr_type;
      if (!category) return;
      
      if (!stats[regionName]) {
        stats[regionName] = {
          categories: {},
          totalPlaces: 0,
          categoryNames: new Set()
        };
      }
      stats[regionName].categories[category] = (stats[regionName].categories[category] || 0) + 1;
      stats[regionName].totalPlaces += 1;
      stats[regionName].categoryNames.add(category);
    });
    
    Object.keys(stats).forEach(key => {
      stats[key].categoryCount = stats[key].categoryNames.size;
      delete stats[key].categoryNames;
    });
    
    return stats;
  }, [placesData, regionsData]);

  const getPopularity = (regionName) => {
    if (popularityData[regionName]) {
      return popularityData[regionName];
    }
    const normalized = normalizeName(regionName);
    for (const [key, value] of Object.entries(popularityData)) {
      if (normalizeName(key) === normalized) {
        return value;
      }
    }
    return 0;
  };

  const getQuantitativeValue = (regionName) => {
    const stats = regionStats[regionName] || { totalPlaces: 0, categoryCount: 0 };
    switch (quantMetric) {
      case 'places':
        return stats.totalPlaces || 0;
      case 'categories':
        return stats.categoryCount || 0;
      case 'requests':
        return getPopularity(regionName);
      default:
        return 0;
    }
  };

  const parsedCsvRegions = useMemo(() => {
    if (!regionsData.length) return [];
    
    return regionsData.map((r) => {
      const origName = r['МР'] || '';
      const normalizedName = normalizeName(origName);
      
      let rawTourismValue = r['Виды туризма'] || '';
      if (!rawTourismValue || rawTourismValue.trim() === '') {
        rawTourismValue = r['Перспективные виды туризма'] || '';
      }
      
      const tourismTypes = rawTourismValue 
        ? rawTourismValue.split(',').map(t => t.trim()).filter(Boolean)
        : [];
      
      const regionStatsData = regionStats[origName] || regionStats[normalizedName] || { categories: {}, totalPlaces: 0, categoryCount: 0 };
      
      let maxCount = 0;
      let dominantCategoryFromPoints = null;
      let totalPoints = regionStatsData.totalPlaces || 0;
      
      for (const [cat, count] of Object.entries(regionStatsData.categories || {})) {
        if (count > maxCount) {
          maxCount = count;
          dominantCategoryFromPoints = cat;
        }
      }
      
      let categoryFromCSV = null;
      if (tourismTypes.length > 0) {
        categoryFromCSV = findCategory(tourismTypes);
      }
      
      let category = null;
      let color = '#e0e0e0';
      
      if (dominantCategoryFromPoints && tourismColors[dominantCategoryFromPoints]) {
        category = dominantCategoryFromPoints;
        color = tourismColors[dominantCategoryFromPoints];
      } else if (categoryFromCSV && tourismColors[categoryFromCSV]) {
        category = categoryFromCSV;
        color = tourismColors[categoryFromCSV];
      } else if (totalPoints > 0 && dominantCategoryFromPoints) {
        category = dominantCategoryFromPoints;
        color = '#e0e0e0';
      } else {
        category = 'Нет данных';
      }

      return {
        origName,
        normalizedName,
        category: category || 'Не классифицирован',
        allTypes: rawTourismValue || 'Данные отсутствуют',
        color,
        pointStats: regionStatsData.categories || {},
        totalPoints: totalPoints,
        categoryCount: regionStatsData.categoryCount || 0,
      };
    }).filter(item => item.origName);
  }, [regionsData, tourismColors, regionStats]);

  const getHeatmapColor = (value, min, max) => {
    if (max === min) return HEATMAP_COLORS[0];
    const normalized = (value - min) / (max - min);
    const index = Math.round(normalized * (HEATMAP_COLORS.length - 1));
    return HEATMAP_COLORS[Math.min(index, HEATMAP_COLORS.length - 1)];
  };

  const getHeatmapRange = useMemo(() => {
    if (!parsedCsvRegions.length) return { min: 0, max: 0 };
    const values = parsedCsvRegions.map(r => getQuantitativeValue(r.origName));
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }, [parsedCsvRegions, quantMetric, regionStats, popularityData]);

  const getMetricLabel = () => {
    switch (quantMetric) {
      case 'places': return 'Количество мест';
      case 'requests': return 'Количество запросов';
      case 'categories': return 'Количество категорий мест';
      default: return '';
    }
  };

  const findAnalyticsForFeature = (feature) => {
    if (!parsedCsvRegions.length) return null;
    
    const nameFromGeo = feature.properties?.name || "";
    const nameFromGeoFull = feature.properties?.name_MO || "";
    
    const normalizedGeo = normalizeName(nameFromGeo);
    const normalizedGeoFull = normalizeName(nameFromGeoFull);
    
    let found = parsedCsvRegions.find(r => 
      r.normalizedName === normalizedGeo || 
      r.normalizedName === normalizedGeoFull ||
      r.origName === nameFromGeo ||
      r.origName === nameFromGeoFull
    );
    
    if (found) return found;
    
    return parsedCsvRegions.find(r => {
      const csvNorm = r.normalizedName;
      return csvNorm.includes(normalizedGeo) || 
             normalizedGeo.includes(csvNorm) ||
             csvNorm.includes(normalizedGeoFull) ||
             normalizedGeoFull.includes(csvNorm);
    }) || null;
  };

  const styleGeoJsonFeature = (feature) => {
    const analytics = findAnalyticsForFeature(feature);
    
    if (!showPolygons) {
      return {
        fill: false,
        color: '#666666',
        weight: 1.2,
        stroke: true,
        opacity: 1
      };
    }

    if (viewMode === 'quantitative') {
      const regionName = analytics?.origName || '';
      const value = getQuantitativeValue(regionName);
      const color = getHeatmapColor(value, getHeatmapRange.min, getHeatmapRange.max);
      
      return {
        fill: true,
        fillColor: color,
        fillOpacity: 0.85,
        color: '#333333',
        weight: 1.2,
        stroke: true
      };
    }
    
    const districtColor = analytics ? analytics.color : '#e0e0e0';
    
    if (selectedCategory) {
      const regionCategory = analytics ? analytics.category : null;
      if (regionCategory !== selectedCategory) {
        return {
          fill: false,
          color: '#cccccc',
          weight: 0.5,
          stroke: true,
          opacity: 0.3
        };
      }
    }

    return {
      fill: true,
      fillColor: districtColor,
      fillOpacity: 0.6,
      color: '#ffffff',
      weight: 1.2,
      stroke: true
    };
  };

  const onEachFeature = (feature, layer) => {
    const analytics = findAnalyticsForFeature(feature);
    
    const title = feature.properties?.name_MO || feature.properties?.name || "Неизвестный район";
    const category = analytics ? analytics.category : 'Нет данных';
    const allTypes = analytics ? analytics.allTypes : 'Данные отсутствуют';
    const pointStats = analytics ? analytics.pointStats || {} : {};
    const totalPoints = analytics ? analytics.totalPoints || 0 : 0;
    const categoryCount = analytics ? analytics.categoryCount || 0 : 0;

    let popupContent = '';
    
    if (viewMode === 'quantitative') {
      const regionName = analytics?.origName || '';
      const value = getQuantitativeValue(regionName);
      const metricLabel = getMetricLabel();
      
      popupContent = `
        <div style="font-family: sans-serif; line-height: 1.4; min-width: 200px;">
          <h4 style="margin:0 0 6px 0; color:#2c3e50; font-size:15px; border-bottom: 2px solid #eee; padding-bottom: 6px;">${title}</h4>
          <p style="margin:8px 0 4px 0; font-size:16px; font-weight:bold; color:#333;">
            ${metricLabel}: ${value}
          </p>
          <p style="margin:0 0 4px 0; font-size:11px; color:#666;">
            Категорий: ${categoryCount} | Точек: ${totalPoints}
          </p>
        </div>
      `;
    } else {
      const pieChartHtml = createPieChart(pointStats, tourismColors);
      
      popupContent = `
        <div style="font-family: sans-serif; line-height: 1.4; min-width: 280px; max-width: 350px;">
          <h4 style="margin:0 0 6px 0; color:#2c3e50; font-size:15px; border-bottom: 2px solid #eee; padding-bottom: 6px;">${title}</h4>
          <div style="margin:8px 0;">
            <p style="margin:0 0 4px 0; font-size:12px;"><b>Преобладающая категория:</b> <span style="color:${analytics?.color || '#666'};font-weight:bold;">${category}</span></p>
            <p style="margin:0 0 4px 0; font-size:11px; color:#666;"><b>Виды туризма:</b> ${allTypes}</p>
            <p style="margin:0; font-size:11px; color:#666;"><b>Точек на карте:</b> ${totalPoints}</p>
          </div>
          <div style="border-top: 1px solid #eee; padding-top: 8px; margin-top: 4px;">
            <p style="margin:0 0 6px 0; font-size:12px; font-weight:bold; color:#2c3e50;">Распределение по видам туризма:</p>
            ${pieChartHtml}
          </div>
        </div>
      `;
    }

    layer.bindPopup(popupContent);

    const getDefaultBorderColor = () => {
      if (!showPolygons) return '#666666';
      return viewMode === 'quantitative' ? '#333333' : '#ffffff';
    };

    layer.on({
      mouseover: (e) => {
        const l = e.target;
        l.setStyle({ 
          color: '#000000',
          weight: 2,
          opacity: 1
        });
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
          l.bringToFront();
        }
      },
      mouseout: (e) => {
        const l = e.target;
        l.setStyle({ 
          color: getDefaultBorderColor(),
          weight: 1.2,
          opacity: 1
        });
      }
    });
  };

  const handleCategoryClick = (category) => {
    setSelectedCategory(prev => prev === category ? null : category);
  };

  if (errorStatus) return <div style={{ padding: '20px', color: 'red' }}>Ошибка: {errorStatus}</div>;
  if (isLoading) return <div className="loading-screen">Загрузка...</div>;

  const geoJsonKey = `geojson-${showPolygons}-${selectedCategory}-${viewMode}-${quantMetric}`;
  const sortedCategories = Object.keys(tourismColors).sort();
  const metricLabel = viewMode === 'quantitative' ? getMetricLabel() : '';

  return (
    <div className="tableau-container">
      <div className="dashboard-wrapper">
        <main className="map-area">
          <MapContainer 
            center={[58.5, 105.5]} 
            zoom={5.0} 
            style={{ height: '100%', width: '100%' }}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            
            <AttributionControl prefix={false} position="bottomright" />

            {geoJsonData && (
              <GeoJSON 
                key={geoJsonKey}
                data={geoJsonData} 
                style={styleGeoJsonFeature}
                onEachFeature={onEachFeature}
              />
            )}

            {showPoints && placesData
              .filter(p => !selectedCategory || p.agr_type === selectedCategory)
              .map((place, idx) => {
                if (!place.lat || !place.lon) return null;
                const lat = parseFloat(place.lat.toString().replace(',', '.'));
                const lon = parseFloat(place.lon.toString().replace(',', '.'));
                if (isNaN(lat) || isNaN(lon)) return null;

                // Получаем адрес: может быть в полях address, original_address или addr
                const address = place.address || place.original_address || place.addr || 'Не указан';

                return (
                  <CircleMarker 
                    key={`poi-${idx}`} 
                    center={[lat, lon]} 
                    radius={4}
                    pane="markerPane"
                    pathOptions={{
                      fillColor: tourismColors[place.agr_type] || '#7f7f7f',
                      fillOpacity: 1,
                      color: '#ffffff',
                      weight: 1.2
                    }}
                    zIndexOffset={1000}
                  >
                    <Popup>
                      <div>
                        <h4>{place.name}</h4>
                        <p><strong>Вид:</strong> {place.agr_type}</p>
                        <p><strong>Адрес:</strong> {address}</p>
                        <p><strong>Район:</strong> {place['region (test_copies_deleted_6.csv1)']}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
          </MapContainer>
        </main>

        <aside className="control-panel">
          <div className="panel-section">
            <label className="section-label">Показать полигоны?</label>
            <div className="radio-group-vertical">
              <label style={{ display: 'block', marginBottom: '6px' }}>
                <input 
                  type="radio" 
                  name="polygon-toggle" 
                  checked={showPolygons === true} 
                  onChange={() => setShowPolygons(true)} 
                /> 
                Да
              </label>
              <label style={{ display: 'block' }}>
                <input 
                  type="radio" 
                  name="polygon-toggle" 
                  checked={showPolygons === false} 
                  onChange={() => setShowPolygons(false)} 
                /> 
                Нет
              </label>
            </div>
          </div>

          <div className="panel-section">
            <label className="section-label">Вид карты:</label>
            <div className="radio-group-vertical">
              <label style={{ display: 'block', marginBottom: '6px' }}>
                <input 
                  type="radio" 
                  name="view-mode" 
                  checked={viewMode === 'tourism'} 
                  onChange={() => setViewMode('tourism')} 
                /> 
                Виды туризма
              </label>
              <label style={{ display: 'block' }}>
                <input 
                  type="radio" 
                  name="view-mode" 
                  checked={viewMode === 'quantitative'} 
                  onChange={() => setViewMode('quantitative')} 
                /> 
                Количественные показатели
              </label>
            </div>
          </div>

          {viewMode === 'quantitative' && (
            <>
              <div className="panel-section">
                <label className="section-label">Показатель района:</label>
                <div className="radio-group-vertical">
                  <label style={{ display: 'block', marginBottom: '6px' }}>
                    <input 
                      type="radio" 
                      name="quant-metric" 
                      checked={quantMetric === 'places'} 
                      onChange={() => setQuantMetric('places')} 
                    /> 
                    Количество мест
                  </label>
                  <label style={{ display: 'block', marginBottom: '6px' }}>
                    <input 
                      type="radio" 
                      name="quant-metric" 
                      checked={quantMetric === 'requests'} 
                      onChange={() => setQuantMetric('requests')} 
                    /> 
                    Количество запросов
                  </label>
                  <label style={{ display: 'block' }}>
                    <input 
                      type="radio" 
                      name="quant-metric" 
                      checked={quantMetric === 'categories'} 
                      onChange={() => setQuantMetric('categories')} 
                    /> 
                    Количество категорий мест
                  </label>
                </div>
              </div>

              <div className="panel-section">
                <label className="section-label" style={{ marginBottom: '8px' }}>
                  Легенда: {metricLabel}
                </label>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    height: '24px', 
                    borderRadius: '4px',
                    overflow: 'hidden',
                    border: '1px solid #ddd'
                  }}>
                    {HEATMAP_COLORS.map((color, i) => (
                      <div 
                        key={i} 
                        style={{ 
                          flex: 1, 
                          backgroundColor: color
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: '#333',
                    fontWeight: 'bold',
                    marginTop: '2px'
                  }}>
                    <span>{getHeatmapRange.min}</span>
                    <span style={{ color: '#999', fontSize: '10px', fontWeight: 'normal' }}>
                      {metricLabel}
                    </span>
                    <span>{getHeatmapRange.max}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="panel-section">
            <label className="section-label">Показать достопримечательности?</label>
            <div className="radio-group-vertical">
              <label style={{ display: 'block', marginBottom: '6px' }}>
                <input 
                  type="radio" 
                  name="points-toggle" 
                  checked={showPoints === true} 
                  onChange={() => setShowPoints(true)} 
                /> 
                Да
              </label>
              <label style={{ display: 'block' }}>
                <input 
                  type="radio" 
                  name="points-toggle" 
                  checked={showPoints === false} 
                  onChange={() => setShowPoints(false)} 
                /> 
                Нет
              </label>
            </div>
          </div>

          <div className="panel-section">
            <label className="section-label">Фильтр видов туризма</label>
            <div className="legend-list">
              <div 
                style={{ 
                  padding: '4px 8px', 
                  marginBottom: '8px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: selectedCategory ? '#007bff' : '#999',
                  borderBottom: selectedCategory ? '1px solid #007bff' : '1px solid #ddd',
                  textAlign: 'center'
                }}
                onClick={() => setSelectedCategory(null)}
              >
                {selectedCategory ? '✕ Показать всё' : 'Все категории'}
              </div>
              
              {sortedCategories.map(cat => {
                const isSelected = selectedCategory === cat;
                const count = categoryCounts[cat] || 0;
                return (
                  <div 
                    key={cat} 
                    className="legend-item" 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      marginBottom: '6px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      cursor: viewMode === 'tourism' ? 'pointer' : 'default',
                      backgroundColor: isSelected ? 'rgba(0, 123, 255, 0.1)' : 'transparent',
                      border: isSelected ? '1px solid #007bff' : '1px solid transparent',
                      transition: 'all 0.2s',
                      opacity: viewMode === 'tourism' ? 1 : 0.5
                    }}
                    onClick={() => {
                      if (viewMode === 'tourism') {
                        handleCategoryClick(cat);
                      }
                    }}
                  >
                    <span style={{ 
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: tourismColors[cat] || '#cccccc',
                      display: 'inline-block',
                      marginRight: '10px',
                      flexShrink: 0,
                      border: '1px solid rgba(0,0,0,0.1)'
                    }}></span>
                    <span style={{ 
                      fontSize: '13px',
                      fontWeight: isSelected ? 'bold' : 'normal',
                      color: isSelected ? '#007bff' : '#333'
                    }}>
                      {cat} <span style={{ fontSize: '11px', color: '#999', fontWeight: 'normal' }}>({count})</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;