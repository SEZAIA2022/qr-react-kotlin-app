import React from 'react';
import { CheckCircle } from 'react-feather'; // npm install react-feather

export default function PasswordSuccess() {
  return (
    <div className="container--sm card card--panel text-center">
      <div className="icon-circle icon-circle--success">
        <CheckCircle size={42} />
      </div>

      <h2 className="title">Password changed</h2>

      <p className="text text--main">
        Your password has been successfully changed.
      </p>
      <p className="text text--muted">
        You can close this page and reopen the application to log in.
      </p>
    </div>
  );
}
