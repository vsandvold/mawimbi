import React from 'react';
import './PageLayout.css';

type PageLayoutProps = React.PropsWithChildren;

export const PageLayout = ({ children }: PageLayoutProps) => {
  return <div className="page">{children}</div>;
};

type PageHeaderProps = React.PropsWithChildren;

export const PageHeader = ({ children }: PageHeaderProps) => {
  return <header className="page__header">{children}</header>;
};

type PageContentProps = React.PropsWithChildren;

export const PageContent = ({ children }: PageContentProps) => {
  return <main className="page__content">{children}</main>;
};
