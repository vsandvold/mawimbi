import { Button, Layout } from 'antd';
import React from 'react';
import { useHistory } from 'react-router-dom';

const { Header, Content, Footer } = Layout;

const HomePage = () => {
  const history = useHistory();

  function handleClick() {
    history.push('/wave');
  }

  return (
    <Layout>
      <Header></Header>
      <Content>
        <Button onClick={handleClick}>Create new wave</Button>
      </Content>
      <Footer></Footer>
    </Layout>
  );
};

export default HomePage;
