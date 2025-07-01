import React from 'react';

const Toolbar = () => {
  const toolbarStyle = {
    width: '100%',
    backgroundColor: '#007bff',
    color: '#fff',
    padding: '15px 20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    position: 'sticky',
    top: 0,
    zIndex: 1000,
    boxSizing: 'border-box',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '24px',
    fontWeight: 'bold',
    userSelect: 'none',
  };

  return (
    <div style={toolbarStyle}>
      SEZAIA
    </div>
  );
};

export default Toolbar;
