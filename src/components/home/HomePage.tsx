import { Button, Typography } from 'antd';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContent, PageLayout } from '../layout/PageLayout';
import './HomePage.css';

const HomePage = () => {
  const navigate = useNavigate();

  function handleClick() {
    navigate('/project');
  }

  const { Title, Text } = Typography;

  return (
    <PageLayout>
      <PageContent>
        <div className="home">
          <Title>Mawimbi</Title>
          <Text>
            <Button type="primary" size="large" onClick={handleClick}>
              Create Project
            </Button>
          </Text>
        </div>
      </PageContent>
    </PageLayout>
  );
};

export default HomePage;
