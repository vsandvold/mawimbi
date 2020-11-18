import { Layout } from 'antd';
import React from 'react';
import './PageLayout.css';

const { Header, Content } = Layout;

type PageLayoutProps = React.PropsWithChildren<{}>;

export const PageLayout = ({ children }: PageLayoutProps) => {
  return <Layout className="page">{children}</Layout>;
};

type PageHeaderProps = React.PropsWithChildren<{}>;

export const PageHeader = ({ children }: PageHeaderProps) => {
  return <Header className="page__header">{children}</Header>;
};

type PageContentProps = React.PropsWithChildren<{}>;

export const PageContent = ({ children }: PageContentProps) => {
  return <Content className="page__content">{children}</Content>;
};
