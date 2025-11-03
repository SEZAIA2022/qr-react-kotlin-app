import React from 'react';

const Toolbar = ({ userApplication }) => {
  return (
    <div className="toolbar toolbar--header">
      <span className="toolbar__title">
        {userApplication ? userApplication : 'ASSIST BY SCAN'}
      </span>
    </div>
  );
};

export default Toolbar;
