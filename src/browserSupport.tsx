import React, { createContext, useContext } from 'react';

type BrowserSupportContext = {
  touchEvents: boolean;
  webkitOfflineAudioContext: boolean;
};

const browserSupport: BrowserSupportContext = {
  touchEvents:
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    (navigator as any).msMaxTouchPoints > 0,
  webkitOfflineAudioContext: 'webkitOfflineAudioContext' in window,
};

export const BrowserSupport =
  createContext<BrowserSupportContext>(browserSupport);

export const useBrowserSupport = () => {
  return useContext(BrowserSupport);
};

type BrowserSupportProviderProps = React.PropsWithChildren;

export const BrowserSupportProvider = (props: BrowserSupportProviderProps) => {
  return (
    <BrowserSupport.Provider value={browserSupport}>
      {props.children}
    </BrowserSupport.Provider>
  );
};
