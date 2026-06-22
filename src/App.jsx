import React from 'react';
import GraphVisualizer from './GraphVisualizer';
// import './App.css'; // O index.css

function App() {
  return (
    // Hemos quitado los vw y vh aquí para dejar que el hijo (GraphVisualizer) los controle
    <div style={{ width: '100%', height: '100%', margin: 0, padding: 0, overflow: 'hidden' }}>
      <GraphVisualizer />
    </div>
  );
}

export default App;