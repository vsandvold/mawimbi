import { Layout } from 'antd';
import React from 'react';
import './PageLayout.css';

const { Header, Content } = Layout;

type PageLayoutProps = {
  children: JSX.Element[] | JSX.Element;
};

export const PageLayout = ({ children }: PageLayoutProps) => {
  return <Layout className="page">{children}</Layout>;
};

type PageHeaderProps = {
  children: JSX.Element[] | JSX.Element;
};

export const PageHeader = ({ children }: PageHeaderProps) => {
  return <Header className="page__header">{children}</Header>;
};

type PageContentProps = {
  children: JSX.Element[] | JSX.Element;
};

export const PageContent = ({ children }: PageContentProps) => {
  return <Content className="page__content">{children}</Content>;
};
