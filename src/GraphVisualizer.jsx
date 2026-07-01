import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import neo4j from 'neo4j-driver';

const NEO4J_URI = import.meta.env.VITE_NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = import.meta.env.VITE_NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = import.meta.env.VITE_NEO4J_PASSWORD || 'password_por_defecto';

const driver = neo4j.driver(
  NEO4J_URI, 
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
);

const GraphVisualizer = () => {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const nodesStateRef = useRef(new Map()); 
  
  const [timeWindow, setTimeWindow] = useState(30);
  const [selectedElement, setSelectedElement] = useState(null);
  
  const [filters, setFilters] = useState({
    onlyMalicious: false,
    hideInternal: false
  });

  const [sectionsOpen, setSectionsOpen] = useState({ attrs: true, conns: true, traffic: true });
  const graphRef = useRef();

  const toggleSection = (section) => {
    setSectionsOpen(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const calculateCurvature = (links) => {
    const linkPairs = {};
    links.forEach(link => {
      const srcId = typeof link.source === 'object' ? link.source.id : link.source;
      const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
      
      const pairId = [srcId, tgtId].sort().join('-');
      if (!linkPairs[pairId]) linkPairs[pairId] = [];
      linkPairs[pairId].push(link);
    });

    Object.values(linkPairs).forEach(pairLinks => {
      pairLinks.forEach((link, i) => {
        link.curvature = pairLinks.length === 1 ? 0 : (i - (pairLinks.length - 1) / 2) * 0.2;
      });
    });
  };

// --- LÓGICA DE FOCUS MODE ---
  const { highlightedNodes, highlightedLinks } = useMemo(() => {
    const hNodes = new Set();
    const hLinks = new Set();

    if (selectedElement) {
      if (selectedElement.type === 'node') {
        hNodes.add(selectedElement.id);
        graphData.links.forEach(link => {
          const srcId = typeof link.source === 'object' ? link.source.id : link.source;
          const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
          if (srcId === selectedElement.id || tgtId === selectedElement.id) {
            hLinks.add(link.internalId);
            hNodes.add(srcId);
            hNodes.add(tgtId);
          }
        });
      } else if (selectedElement.type === 'link') {
        hLinks.add(selectedElement.internalId);
        const srcId = typeof selectedElement.source === 'object' ? selectedElement.source.id : selectedElement.source;
        const tgtId = typeof selectedElement.target === 'object' ? selectedElement.target.id : selectedElement.target;
        hNodes.add(srcId);
        hNodes.add(tgtId);
      }
    }
    return { highlightedNodes: hNodes, highlightedLinks: hLinks };
  }, [selectedElement, graphData.links]);

  useEffect(() => {
    const fetchData = async () => {
      const session = driver.session({ database: 'TFM' });
      const currentTs = Date.now() / 1000; 

      try {
        const result = await session.run(`
          MATCH (n:IP)-[rel:NETWORK_CONNECTION]->(m:IP)
          WHERE rel.ts >= ($currentTs - toFloat($timeWindow)) AND rel.ts <= $currentTs
          RETURN n, rel, m
        `, { currentTs, timeWindow });

        const newNodesMap = new Map();
        const rawLinks = [];

        const getInt = (v) => (v?.low !== undefined ? v.low : v);

        result.records.forEach(record => {
          const sourceNode = record.get('n').properties;
          const targetNode = record.get('m').properties;
          const relObject = record.get('rel'); 
          const relationship = relObject.properties; 
          const uniqueNeo4jId = relObject.elementId || relObject.identity.low.toString();

          if (!newNodesMap.has(sourceNode.address)) {
            newNodesMap.set(sourceNode.address, { id: sourceNode.address, isLocal: sourceNode.is_local, role: 'origen' });
          } else {
            const existingNode = newNodesMap.get(sourceNode.address);
            if (existingNode.role === 'destino') existingNode.role = 'ambos';
          }

          if (!newNodesMap.has(targetNode.address)) {
            newNodesMap.set(targetNode.address, { id: targetNode.address, isLocal: targetNode.is_local, role: 'destino' });
          } else {
            const existingNode = newNodesMap.get(targetNode.address);
            if (existingNode.role === 'origen') existingNode.role = 'ambos';
          }
          let captureTime = '-';
          if (relationship.created_at) {
            captureTime = new Date(relationship.created_at.toString()).toLocaleTimeString();
          }

          rawLinks.push({
            source: sourceNode.address,
            target: targetNode.address,
            isMalicious: relationship.label_binary === 'True' || relationship.label_binary === true,
            tactic: relationship.label_tactic,
            uid: relationship.uid,
            internalId: uniqueNeo4jId,
            duration: relationship.duration,
            origBytes: getInt(relationship.orig_bytes),
            respBytes: getInt(relationship.resp_bytes),
            missedBytes: getInt(relationship.missed_bytes),
            origPkts: getInt(relationship.orig_pkts),
            respPkts: getInt(relationship.resp_pkts),
            srcPort: getInt(relationship.src_port),
            port: getInt(relationship.dest_port) ?? 'N/A', 
            proto: relationship.proto,
            service: relationship.service,
            connState: relationship.conn_state,
            createdAt: captureTime 
          });
        });

        let finalLinks = rawLinks;

        if (filters.onlyMalicious) {
          finalLinks = finalLinks.filter(link => link.isMalicious);
        }

        if (filters.hideInternal) {
          finalLinks = finalLinks.filter(link => {
            const srcNode = newNodesMap.get(link.source);
            const tgtNode = newNodesMap.get(link.target);
            return !((srcNode && srcNode.isLocal) && (tgtNode && tgtNode.isLocal));
          });
        }

        const finalNodesMap = new Map();
        if (filters.onlyMalicious || filters.hideInternal) {
          const activeNodeIds = new Set();
          finalLinks.forEach(l => {
            activeNodeIds.add(l.source);
            activeNodeIds.add(l.target);
          });
          newNodesMap.forEach((node, id) => {
            if (activeNodeIds.has(id)) finalNodesMap.set(id, node);
          });
        } else {
          newNodesMap.forEach((node, id) => finalNodesMap.set(id, node));
        }

        calculateCurvature(finalLinks);

        const currentNodesMap = nodesStateRef.current;
        const preservedNodes = [];

        Array.from(finalNodesMap.values()).forEach(newNode => {
          if (currentNodesMap.has(newNode.id)) {
            const existingObject = currentNodesMap.get(newNode.id);
            existingObject.role = newNode.role; 
            preservedNodes.push(existingObject);
          } else {
            newNode.x = (Math.random() - 0.5) * 800;
            newNode.y = (Math.random() - 0.5) * 800;
            preservedNodes.push(newNode);
          }
        });

        nodesStateRef.current = new Map(preservedNodes.map(n => [n.id, n]));
        setGraphData({ nodes: preservedNodes, links: finalLinks });

      } catch (error) {
        console.error("Error consultando Neo4j:", error);
      } finally {
        await session.close();
      }
    };

    fetchData();
    const intervalId = setInterval(fetchData, 1000); 

    return () => clearInterval(intervalId);
  }, [timeWindow, filters]); 

  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.d3Force('charge').strength(-50).distanceMax(400);
      graphRef.current.d3Force('link').distance(70);
    }
  }, []);

  const paintNode = useCallback((node, ctx, globalScale) => {
    const label = node.id;
    const fontSize = 12 / globalScale;
    
    let nodeColor = '#999999'; 
    if (node.role === 'origen') nodeColor = '#00d8ff';       // Cian
    else if (node.role === 'destino') nodeColor = '#fbc531'; // Amarillo
    else if (node.role === 'ambos') nodeColor = '#c56cf0';   // Violeta

    if (node.fx) nodeColor = '#ffffff'; 
    
    // ATENUACIÓN: Si hay algo seleccionado y este nodo no participa, lo hacemos casi invisible
    const isMuted = selectedElement && !highlightedNodes.has(node.id);
    ctx.globalAlpha = isMuted ? 0.15 : 1.0;

    // Pintar nodo
    ctx.beginPath();
    ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false);
    ctx.fillStyle = nodeColor;
    ctx.fill();
    
    // MARCADOR VISUAL: Si este es EXACTAMENTE el nodo sobre el que has hecho clic, le dibujamos un anillo
    if (selectedElement && selectedElement.type === 'node' && selectedElement.id === node.id) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 9, 0, 2 * Math.PI, false); // Anillo más grande
      ctx.lineWidth = 2 / globalScale;
      ctx.strokeStyle = '#ffffff'; // Blanco brillante
      ctx.stroke();
    }

    // Texto
    ctx.font = `bold ${fontSize}px Sans-Serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText(label, node.x, node.y + 6);

    // Restaurar opacidad para la siguiente iteración
    ctx.globalAlpha = 1.0;
  }, [selectedElement, highlightedNodes]);

  const handleNodeDragEnd = useCallback(node => {
    node.fx = node.x;
    node.fy = node.y;
    nodesStateRef.current.set(node.id, node);
  }, []);

  const releaseAllNodes = () => {
    const releasedNodes = graphData.nodes.map(node => {
      node.fx = undefined;
      node.fy = undefined;
      delete node.fx;
      delete node.fy;
      return node;
    });
    nodesStateRef.current = new Map(releasedNodes.map(n => [n.id, n]));
    setGraphData({ ...graphData, nodes: releasedNodes });
  };

  const handleFocusNode = useCallback((node) => {
    if (!node) return;
    setSelectedElement({ type: 'node', ...node });
    if (graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 800); 
      graphRef.current.zoom(4, 800); 
    }
  }, []);

  const handleFocusLink = useCallback((link) => {
    if (!link) return;
    setSelectedElement({ type: 'link', ...link });
    
    if (graphRef.current) {
      const srcNode = typeof link.source === 'object' ? link.source : graphData.nodes.find(n => n.id === link.source);
      const tgtNode = typeof link.target === 'object' ? link.target : graphData.nodes.find(n => n.id === link.target);

      if (srcNode && tgtNode && srcNode.x !== undefined && tgtNode.x !== undefined) {
        const midX = (srcNode.x + tgtNode.x) / 2;
        const midY = (srcNode.y + tgtNode.y) / 2;
        graphRef.current.centerAt(midX, midY, 800);
        graphRef.current.zoom(6, 800); 
      }
    }
  }, [graphData.nodes]);

  const renderSidePanel = () => {
    if (!selectedElement) return null;

    const getSafeId = (nodeRef) => {
      if (!nodeRef) return 'Desconocido';
      if (typeof nodeRef === 'object') return nodeRef.id || 'Desconocido';
      return String(nodeRef);
    };

    const panelStyle = {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: '380px',
      backgroundColor: '#2a2a2a',
      borderLeft: '1px solid #444',
      padding: '20px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 100,
      boxSizing: 'border-box',
      boxShadow: '-5px 0 15px rgba(0,0,0,0.5)'
    };

    const accordionHeaderStyle = {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a1a', padding: '12px',
      borderRadius: '4px', cursor: 'pointer', marginTop: '15px', userSelect: 'none', fontWeight: 'bold', fontSize: '0.95em',
      border: '1px solid #444', color: '#fff'
    };

    const accordionContentStyle = {
      padding: '12px', backgroundColor: '#1f1f1f', border: '1px solid #333', borderTop: 'none', borderRadius: '0 0 4px 4px',
      display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85em'
    };

    const renderAttrRow = (label, val) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #2d2d2d', paddingBottom: '6px' }}>
        <span style={{ color: '#aaa' }}>{label}:</span>
        <span style={{ fontWeight: '500', color: '#fff', wordBreak: 'break-all', textAlign: 'right' }}>{val ?? '-'}</span>
      </div>
    );

    if (selectedElement.type === 'node') {
      const connectedLinks = graphData.links.filter(l => {
        const srcId = getSafeId(l.source);
        const tgtId = getSafeId(l.target);
        return srcId === selectedElement.id || tgtId === selectedElement.id;
      });

      return (
        <div style={panelStyle}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid #444', paddingBottom: '10px' }}>Detalles del Nodo</h3>
          {renderAttrRow('Dirección IP', selectedElement.id)}
          {renderAttrRow('Rol de Tráfico', selectedElement.role?.toUpperCase())}
          
          <div style={accordionHeaderStyle} onClick={() => toggleSection('traffic')}>
            <span>🔗 Flujos de Red Asociados ({connectedLinks.length})</span>
            <span>{sectionsOpen.traffic ? '▼' : '►'}</span>
          </div>
          
          {sectionsOpen.traffic && (
            <div style={{ ...accordionContentStyle, maxHeight: '50vh', overflowY: 'auto' }}>
              {connectedLinks.length === 0 ? (
                <p style={{ color: '#888' }}>No hay tráfico en este intervalo.</p>
              ) : (
                connectedLinks.map((link, idx) => {
                  const srcId = getSafeId(link.source);
                  const tgtId = getSafeId(link.target);
                  const isSource = srcId === selectedElement.id;
                  const remoteNodeId = isSource ? tgtId : srcId;

                  return (
                    <div 
                      key={idx}
                      onClick={() => handleFocusLink(link)}
                      style={{ 
                        padding: '10px', backgroundColor: '#111', 
                        borderLeft: `4px solid ${link.isMalicious ? '#ff4d4d' : '#45b549'}`, 
                        cursor: 'pointer', borderRadius: '0 4px 4px 0', transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#333'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#111'}
                    >
                      <strong>{isSource ? '➔ Hacia:' : '⬅ Desde:'}</strong> {remoteNodeId}
                      <div style={{ color: '#888', marginTop: '3px' }}>Puerto: {link.port} | {link.isMalicious ? '⚠️ Ataque' : '✅ Seguro'}</div>
                    </div>
                  );
                })
              )}
            </div>
          )}
          <button onClick={() => setSelectedElement(null)} style={{ marginTop: 'auto', padding: '10px', backgroundColor: '#ff4d4d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%', fontWeight: 'bold' }}>Cerrar</button>
        </div>
      );
    }

    if (selectedElement.type === 'link') {
      const srcId = getSafeId(selectedElement.source);
      const tgtId = getSafeId(selectedElement.target);

      return (
        <div style={panelStyle}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid #444', paddingBottom: '10px' }}>Inspección de Conexión</h3>
          
          <div style={accordionHeaderStyle} onClick={() => toggleSection('conns')}>
            <span>🌐 Nodos Relacionados (Endpoints)</span>
            <span>{sectionsOpen.conns ? '▼' : '►'}</span>
          </div>
          
          {sectionsOpen.conns && (
            <div style={accordionContentStyle}>
              <div style={{ backgroundColor: '#111', padding: '12px', borderRadius: '4px', textAlign: 'center', lineHeight: '1.6' }}>
                <span style={{ color: '#aaa', fontSize: '0.85em' }}>ORIGEN</span> <br/>
                <span 
                  onClick={() => handleFocusNode(graphData.nodes.find(n => n.id === srcId))}
                  style={{ color: '#00d8ff', cursor: 'pointer', textDecoration: 'underline', fontWeight: 'bold', fontSize: '1.1em' }}
                >{srcId}</span> 
                <br/> <span style={{ color: selectedElement.isMalicious ? '#ff4d4d' : '#45b549' }}>⬇</span> <br/> 
                <span style={{ color: '#aaa', fontSize: '0.85em' }}>DESTINO</span> <br/>
                {/* --- AHORA EL DESTINO ES AMARILLO EN EL MENÚ TAMBIÉN --- */}
                <span 
                  onClick={() => handleFocusNode(graphData.nodes.find(n => n.id === tgtId))}
                  style={{ color: '#fbc531', cursor: 'pointer', textDecoration: 'underline', fontWeight: 'bold', fontSize: '1.1em' }}
                >{tgtId}</span>
              </div>
            </div>
          )}

          <div style={accordionHeaderStyle} onClick={() => toggleSection('attrs')}>
            <span>📊 Atributos y Métricas de Red</span>
            <span>{sectionsOpen.attrs ? '▼' : '►'}</span>
          </div>
          
          {sectionsOpen.attrs && (
            <div style={accordionContentStyle}>
              <div style={{ color: selectedElement.isMalicious ? '#ff4d4d' : '#45b549', fontWeight: 'bold', textAlign: 'center', fontSize: '1.1em', padding: '5px 0', borderBottom: '1px solid #333' }}>
                {selectedElement.isMalicious ? `⚠️ ${selectedElement.tactic}` : '✅ CONEXIÓN BENIGNA'}
              </div>
              {renderAttrRow('UID Zeek', selectedElement.uid)}
              {renderAttrRow('Protocolo', selectedElement.proto?.toUpperCase())}
              {renderAttrRow('Servicio Aplicación', selectedElement.service?.toUpperCase() || 'Desconocido')}
              {renderAttrRow('Estado Conexión', selectedElement.connState)}
              {renderAttrRow('Puerto Origen', selectedElement.srcPort)}
              {renderAttrRow('Puerto Destino', selectedElement.port)}
              {renderAttrRow('Duración (s)', selectedElement.duration ? `${selectedElement.duration}s` : 'Instante')}
              {renderAttrRow('Bytes Origen', selectedElement.origBytes)}
              {renderAttrRow('Bytes Destino', selectedElement.respBytes)}
              {renderAttrRow('Bytes Perdidos', selectedElement.missedBytes)}
              {renderAttrRow('Paquetes Origen', selectedElement.origPkts)}
              {renderAttrRow('Paquetes Destino', selectedElement.respPkts)}
              {renderAttrRow('Captura (Hora BD)', selectedElement.createdAt)}
            </div>
          )}
          
          <button onClick={() => setSelectedElement(null)} style={{ marginTop: 'auto', padding: '10px', backgroundColor: '#ff4d4d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%', fontWeight: 'bold' }}>Cerrar Inspector</button>
        </div>
      );
    }
  };

  return (
    <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', backgroundColor: '#1e1e1e', color: 'white', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.85)', padding: '15px', borderRadius: '8px', border: '1px solid #333', width: '280px', boxSizing: 'border-box' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#ff4d4d', borderBottom: '1px solid #444', paddingBottom: '10px' }}>• PANEL DE CONTROL SOC</h4>
        
        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9em', color: '#ccc' }}>Ventana Temporal:</label>
        <select 
          value={timeWindow} 
          onChange={(e) => setTimeWindow(Number(e.target.value))}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', backgroundColor: '#222', color: 'white', border: '1px solid #555', marginBottom: '20px' }}
        >
          <option value={30}>Últimos 30 segundos</option>
          <option value={300}>Últimos 5 minutos</option>
          <option value={900}>Últimos 15 minutos</option>
          <option value={1800}>Últimos 30 minutos</option>
        </select>
        
        <div style={{ borderTop: '1px solid #444', paddingTop: '15px', marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '10px', fontSize: '0.9em', color: '#ccc' }}>Filtros de Análisis:</label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '10px', fontSize: '0.85em', color: filters.onlyMalicious ? '#ff4d4d' : '#fff' }}>
            <input type="checkbox" checked={filters.onlyMalicious} onChange={(e) => setFilters(prev => ({ ...prev, onlyMalicious: e.target.checked }))} style={{ marginRight: '10px', accentColor: '#ff4d4d' }}/>
            🚨 Mostrar SOLO ataques
          </label>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.85em', color: filters.hideInternal ? '#3498db' : '#fff' }}>
            <input type="checkbox" checked={filters.hideInternal} onChange={(e) => setFilters(prev => ({ ...prev, hideInternal: e.target.checked }))} style={{ marginRight: '10px', accentColor: '#3498db' }}/>
            🌐 Ocultar tráfico interno (LAN)
          </label>
        </div>

        <div style={{ fontSize: '0.8em', color: '#888', marginBottom: '15px', backgroundColor: '#111', padding: '10px', borderRadius: '4px', textAlign: 'center' }}>
          <strong>VISIÓN ACTUAL</strong><br/>
          <span style={{ color: '#fff' }}>{graphData.nodes.length}</span> IPs activas<br/>
          <span style={{ color: '#fff' }}>{graphData.links.length}</span> Conexiones detectadas
        </div>

        <button onClick={releaseAllNodes} style={{ padding: '8px 10px', backgroundColor: '#444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85em', width: '100%', transition: 'background 0.2s' }} onMouseEnter={e => e.target.style.backgroundColor='#555'} onMouseLeave={e => e.target.style.backgroundColor='#444'}>
          📍 Desanclar posiciones
        </button>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          nodeCanvasObject={paintNode}
          
          linkColor={link => {
            if (selectedElement) {
              if (selectedElement.type === 'link' && selectedElement.internalId === link.internalId) return '#ffffff';
              if (!highlightedLinks.has(link.internalId)) return 'rgba(100, 100, 100, 0.05)';
            }
            return link.isMalicious ? '#ff4d4d' : 'rgba(69, 181, 73, 0.3)';
          }}
          
          linkWidth={link => {
            if (selectedElement && selectedElement.type === 'link' && selectedElement.internalId === link.internalId) return 6;
            return link.isMalicious ? 2.5 : 1;
          }}
          
          linkCurvature="curvature"
          linkDirectionalArrowLength={3.5}
          linkDirectionalArrowRelPos={1}
          
          linkDirectionalArrowColor={link => {
            if (selectedElement && !highlightedLinks.has(link.internalId)) return 'rgba(0,0,0,0)'; 
            return link.isMalicious ? '#ff4d4d' : 'rgba(69, 181, 73, 0.8)';
          }}
          
          onNodeClick={handleFocusNode}
          onLinkClick={handleFocusLink}
          onBackgroundClick={() => setSelectedElement(null)}
          onNodeDragEnd={handleNodeDragEnd}
          
          d3AlphaDecay={0.08}
          d3VelocityDecay={0.6}
        />
      </div>

      {renderSidePanel()}
      
    </div>
  );
};

export default GraphVisualizer;