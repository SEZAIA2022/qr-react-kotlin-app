import React from 'react';
import EditableTextSection from './EditableTextSection';

const StaticPage = () => {
  return (
    <div>
      <EditableTextSection apiKey="about_us" title="About Us" />
      <EditableTextSection apiKey="term_of_use" title="Terms of Use" />
      <EditableTextSection apiKey="privacy_policy" title="Privacy Policy" />
    </div>
  );
};

export default StaticPage;
