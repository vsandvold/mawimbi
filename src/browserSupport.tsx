import React, { createContext, useContext } from 'react';

type BrowserSupportContext = {
  touchEvents: boolean;
  webkitOfflineAudioContext: boolean;
};

const browserSupport: BrowserSupportContext = {
  touchEvents:
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0,
  webkitOfflineAudioContext: window.hasOwnProperty('webkitOfflineAudioContext'),
};

export const BrowserSupport = createContext<BrowserSupportContext>(
  browserSupport
);

export const useBrowserSupport = () => {
  return useContext(BrowserSupport);
};

type BrowserSupportProviderProps = {
  children: JSX.Element[] | JSX.Element;
};

export const BrowserSupportProvider = ({
  children,
}: BrowserSupportProviderProps) => {
  return (
    <BrowserSupport.Provider value={browserSupport}>
      {children}
    </BrowserSupport.Provider>
  );
};
