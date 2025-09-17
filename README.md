
# **TOP – Turin Open Data Platform**

*A Demo of near real-time urban data platform highlighting the importance of KPIs in smart cities*
## 🚦 ETL Status <img src="https://github.com/NavidTavakoli/TOP-turin-open-data-platform/blob/main/green-dot.gif" alt="blinker" width="20"/>
![ETL](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/actions/workflows/cron-etl.yml/badge.svg)
![Reddit](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/actions/workflows/cron-reddit.yml/badge.svg)
![Traffic Purge](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/actions/workflows/cron-purge-traffic.yml/badge.svg)
![Purge Env](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/actions/workflows/cron-purge-env.yml/badge.svg)

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Language: JavaScript](https://img.shields.io/badge/Language-JavaScript-yellow.svg)
![Runtime: Node.js](https://img.shields.io/badge/Runtime-Node.js%2020-brightgreen.svg)


![Demo 001](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/blob/main/Demo%20001.png)



## About the Project

**Turin Open Data Platform (TOP)** is a real-world prototype of a **smart city KPI dashboard**. It is a project designed to demonstrate how **Key Performance Indicators (KPIs)** can empower smart cities. By collecting, cleaning, and visualizing near real-time data from multiple sources, this platform provides valuable insights into the urban environment of **Turin, Italy**.

The platform integrates diverse datasets—including **weather**, **air quality**, **traffic conditions**, and even **citizen opinions from Reddit**—to build a unified city dashboard. The goal is to highlight how open data and automation can support decision-making, sustainability, and better quality of life in modern urban ecosystems and smart cities.

![Demo 002](https://github.com/NavidTavakoli/TOP-turin-open-data-platform/blob/main/Demo%20002.png)



## 🌍 Data Sources

The platform integrates multiple APIs into a single PostgreSQL database hosted on **Supabase**:

- **🌦️ Weather (Open-Meteo API)**
   Current meteorological conditions for Turin (temperature, humidity, wind, precipitation, etc.).
- **🏭 Air Quality (WAQI API – Lingotto station)**
   Near air quality index (AQI) and pollutants such as PM2.5, PM10, O₃, NO₂, SO₂.
- **🚦 Traffic Flow (5T Piemonte API)**
   Road speed and flow indicators across the Piemonte region, categorized into congestion levels (free, moderate, busy, heavy, jam).
- **💬 Reddit /r/Torino**
   The last 50 posts from the local Reddit community.



## ✨ Features

- 🌦 **Weather Data** – Fetches real-time weather information for Turin.
- 🌫 **Air Quality Monitoring** – Tracks pollution and atmospheric conditions across the city.
- 🚦 **Traffic Data** – Collects mobility and congestion information from the Piedmont region.
- 💬 **Citizen Voices** – Gathers the latest Reddit posts about Turin to reflect community sentiment.
- ⚡ **Automated Data Pipeline** – Uses **GitHub Actions** to fetch, clean, and load data into a cloud-hosted PostgreSQL database (**Supabase**).
- 📊 **Real-Time Dashboard** – Interactive city dashboard that visualizes KPIs for Turin in near real-time.



## ⚙️ ETL & Workflows

All pipelines are automated using **GitHub Actions**, located in `.github/workflows`.

| Workflow file                | Purpose                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| **`cron-etl.yml`**           | Fetches and ingests fresh datasets (weather, air quality, traffic, Reddit). Runs on a schedule to ensure near real-time updates. |
| **`cron-purge-env.yml`**     | Cleans redundant or outdated **environmental data** from the database, keeping storage optimized. |
| **`cron-purge-traffic.yml`** | Purges stale **traffic data** to maintain only relevant and recent mobility information. |
| **`cron-reddit.yml`**        | Collects and processes the **latest Reddit posts** about Turin, reflecting real-time citizen sentiment. |

**Pipeline flow:**

1. Workflows fetch raw data from external APIs.
2. ETL jobs clean and preprocess the data.
3. Data is inserted into **Supabase (PostgreSQL)** for structured storage.
4. The City Dashboard queries Supabase to visualize KPIs in real-time.



## 🗄️ Database Design

- **Supabase (PostgreSQL)** hosts the structured tables (`weather_current`, `air_quality_current`, `traffic_flow_current`, `reddit_torino_posts`).

- **Views** provide higher-level KPIs (e.g., city-wide traffic congestion summary).

- **Row Level Security (RLS)** + policies ensure that external clients can only **read** public-facing data.

  

## 🖥 City Dashboard

The [City Dashboard](https://navidtavakolishalmani.com/city-dashboard )  presents all integrated datasets in a user-friendly, graphical format.

- Weather and air quality indexes update in real-time.
- Traffic congestion is tracked continuously.
- Reddit feeds showcase live community perspectives.

This dashboard illustrates how **data-driven insights** can help policymakers, researchers, and citizens better understand urban dynamics.



## 🛠 Tech Stack

- **Backend / Data Pipeline**: [GitHub Actions](https://github.com/features/actions), APIs, [Node.js ](https://nodejs.org/en)
- **Database**:  [Supabase | The Postgres Development Platform.](https://supabase.com/) (PostgreSQL)
- **Frontend**: Web-based City Dashboard ( [JavaScript](https://www.w3schools.com/js/), [HTML ](https://www.w3schools.com/Html/), [CSS ](https://www.w3schools.com/css/))
- **Visualization**: Graphs & real-time charts for KPIs ([Apache ECharts](https://echarts.apache.org/))

```mermaid
flowchart TD
    subgraph DataSources[🌍 Data Sources]
        A1["🌦️ Weather"]
        A2["🏭 Air Quality"]
        A3["🚦 Traffic Flow"]
        A4["💬Society"]
    end

    subgraph ETL[⚙️ ETL & Automation]
        B1["⏱️ GitHub Actions"]
    end

    subgraph Database[🗄️ Supabase]
        C1[(PostgreSQL DB)]
        C2["PostgREST REST API"]
    end

    subgraph Dashboard[📊 City Dashboard]
        D1["Dashboard"]
        D2["Visualizations"]
    end

    A1 --> B1
    A2 --> B1
    A3 --> B1
    A4 --> B1

    B1 --> C1
    C1 --> C2
    C2 --> D1
    D1 --> D2

    %% ---------- Styles ----------
    classDef rounded fill:#f9f9f9,stroke:#333,stroke-width:1px,rx:20,ry:20
    class A1,A2,A3,A4,B1,C2,D1,D2 rounded

    %% ---------- subgraph --------
    style DataSources fill:#FFFFFF,stroke:#00BF63,stroke-width:2px,rx:25,ry:25
    style ETL fill:#FFBD59,stroke:#FF914D,rx:25,ry:25
    style Database fill:#0097B2,rx:25,ry:25
    style Dashboard fill:#00BF63,rx:25,ry:25

```



## 🌍 Why This Project Matters

Smart cities need more than just open data — they need **actionable insights**.  
By automating ETL pipelines and centralizing diverse datasets (weather, air quality, traffic, and citizen sentiment), **TOP – Turin Open Data Platform** transforms raw information into **Key Performance Indicators (KPIs)** that decision-makers can trust.

### 📌 Why KPIs?
KPIs are not just numbers; they are the **pulse of the city**:
- **Municipalities & City Planners** → Monitor mobility, congestion, and pollution in real time to support evidence-based policies.  
- **Environmental Agencies** → Track emissions and weather patterns for sustainability and climate action.  
- **Transport Authorities** → Optimize public transport and traffic flows with near real-time mobility data.  
- **Healthcare & Public Safety** → Use AQI trends and extreme weather alerts for risk prevention and community health.  
- **Research & Academia** → Access clean, integrated datasets to build models for smarter, greener urban futures.  

### 🚀 Impact
With TOP, a city can go from **reactive monitoring** to **proactive management**:  
- From **reacting** to traffic jams → to **predicting and preventing** congestion.  
- From **periodic pollution reports** → to **continuous air quality surveillance**.  
- From **static dashboards** → to **scalable, automated KPI pipelines** that work 24/7.  

This project is a **prototype for any city worldwide**: plug in local data sources, get instant REST APIs and dashboards, and unlock the power of KPIs for smarter governance.


## 🎯 Next Steps

- Add KPIs for **energy consumption and renewables** (Terna).
- Integrate **public transport real-time** (GTT GTFS-RT).
- Explore **social sentiment analysis** from Reddit posts.
- Expand dashboard visualizations (pie charts, heatmaps, congestion maps).



## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a pull request.

## 🙌 Acknowledgements

- Supabase for managed PostgreSQL
- GitHub Actions for CI/CD workflows
- Open APIs providing weather, air quality, and traffic data

---

📝 Produced by [**Navid Tavakoli Shalmani**](https://navidtavakolishalmani.com/)

🚧 This project is under active development









