import { useState, useEffect, useRef } from 'react';
import {
  Table,
  Header,
  HeaderRow,
  Body,
  Row,
  HeaderCell,
  Cell,
} from "@table-library/react-table-library/table";
import { usePagination } from '@table-library/react-table-library/pagination';
import { Action } from '@table-library/react-table-library/types/common';
import { Group, Pagination } from '@mantine/core';

import { useTableTheme } from './useTableTheme';

import './CryptoPricesTable.css'

const GET_COINS_MARKETS_URL = 'https://api.coincap.io/v2/assets';
const GET_COINS_MARKETS_URL2 = 'https://api.coingecko.com/api/v3/coins/markets';
const WEB_SOCKETS_API_URL = 'wss://ws.coincap.io/prices';

const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const TABLE_PAGE_SIZE = 15;
const TOTAL_CRYPTOCURRENCY_COUNT = 2296;

type Cryptocurrency = {
  id: string;
  rank: string;
  symbol: string;
  name: string;
  priceUsd: string;
  marketCapUsd: string;
  changePercent24Hr: string;
  vwap24Hr: string;
  changePercent7d?: number;
};

export const CryptoPricesTable = () => {
  const [data, setData] = useState<{nodes: Cryptocurrency[]}>({nodes: []});

  function fetchCoins(page: number) {
    return Promise.allSettled([
      fetch(`${GET_COINS_MARKETS_URL}?offset=${(page - 1) * TABLE_PAGE_SIZE}&limit=${TABLE_PAGE_SIZE}`)
      .then(resp => resp.json()),
      fetch(`${GET_COINS_MARKETS_URL2}?vs_currency=usd&price_change_percentage=7d&sparkline=true&page=${page}&per_page=${TABLE_PAGE_SIZE}`)
      .then(resp => resp.json())
    ])
      .then(([result1, result2]) => {
        if (result1.status !== 'fulfilled') {
          return;
        }

        const {data: data1} = result1.value;
        const isData2Loaded = result2.status === 'fulfilled';
        const data2 = isData2Loaded ? result2.value : undefined;
        
        return data1.map((item: Cryptocurrency, i: number) => {
        return {
          ...item,
          changePercent7d: isData2Loaded ? data2[i].price_change_percentage_7d_in_currency : undefined,
          sprakline7d: isData2Loaded ? data2[i].sparkline_in_7d : undefined,
        };
      });
    });
  }

  useEffect(() => {
    fetchCoins(1)
      .then((data) => setData({nodes: data}));
  }, []);

  const coinsRowsRef = useRef<(HTMLElement | null)[]>([]);
  const setCoinRowRef = (node: HTMLElement | null, i: number) => {
    coinsRowsRef.current[i] = node;
  };
  useEffect(() => {
    if (!data.nodes.length) return;

    const assetsIDs = data.nodes.map(item => item.id).join(',');
    const websocket = new WebSocket(`${WEB_SOCKETS_API_URL}?assets=${assetsIDs}`);
    websocket.onmessage = (msg) => {
      const updates = JSON.parse(msg.data);
      const coinsIDsToUpdate = Object.keys(updates);

      const updatedData = data.nodes.map((item, i) => {
        const hasUpdates = coinsIDsToUpdate.includes(item.id);
        if (hasUpdates) {
          const hasGrown = item.priceUsd < updates[item.id];
          const hasFallen = item.priceUsd > updates[item.id];
          const coinRow: HTMLElement | null = coinsRowsRef.current[i];

          if (hasGrown) {
            coinRow?.classList.add('green-flash');
            setTimeout(() => {
              coinRow?.classList.remove('green-flash');
            }, 400);
          } else if (hasFallen) {
            coinRow?.classList.add('red-flash');
            setTimeout(() => {
              coinRow?.classList.remove('red-flash');
            }, 400);
          }
        }

        return hasUpdates
          ? {
            ...item,
            priceUsd: updates[item.id]
          }
          : item;
      });

      setData({nodes: updatedData});
    };

    return () => {
      websocket.close();
    };
  }, [data]);

  const onPaginationChange  = ({ payload: { page } }: Action) => {
    fetchCoins(page + 1)
      .then((data) => setData({nodes: data}));
  }
  const pagination = usePagination(data, {
    state: {
      page: 0,
      size: TABLE_PAGE_SIZE,
    },
    onChange: onPaginationChange,
  });

  const theme = useTableTheme();

  return (
    <>
      <Table 
        data={data} 
        theme={theme} 
        layout={{ custom: true, horizontalScroll: true }}
      >
        {(tableList: Cryptocurrency[]) => (
          <>
            <Header>
              <HeaderRow>
                <HeaderCell pinLeft>Rank</HeaderCell>
                <HeaderCell pinLeft>Name</HeaderCell>
                <HeaderCell>Price</HeaderCell>
                <HeaderCell>Market Cap</HeaderCell>
                <HeaderCell>Change (24Hr)</HeaderCell>
                <HeaderCell>Change (7d)</HeaderCell>
              </HeaderRow>
            </Header>

            <Body>
              {tableList.map((item, i) => {
                return (
                  <Row key={item.id} item={item} >
                    <div className="row" ref={node => setCoinRowRef(node, i)}>
                      <Cell pinLeft>{item.rank}</Cell>
                      <Cell pinLeft>
                        <img className="crypto-icon" src={`https://assets.coincap.io/assets/icons/${item.symbol.toLowerCase()}@2x.png`} />
                        {item.name}&nbsp;<span className="crypto-symbol">{item.symbol}</span>
                      </Cell>
                      <Cell>{priceFormatter.format(+item.priceUsd)}</Cell>
                      <Cell>{priceFormatter.format(+item.marketCapUsd)}</Cell>
                      <Cell>{(Math.round(+item.changePercent24Hr * 100) / 100).toFixed(2) + '%'}</Cell>
                      <Cell>{item.changePercent7d !== undefined ? priceFormatter.format(+item.changePercent7d) : '-'}</Cell>
                    </div>
                  </Row>
                );
              })}
            </Body>
          </>
        )}
      </Table>
      <Group position="right" mx={10} my={5}>
        <Pagination
          total={TOTAL_CRYPTOCURRENCY_COUNT / TABLE_PAGE_SIZE}
          page={pagination.state.page + 1}
          onChange={(page) => pagination.fns.onSetPage(page - 1)}
          isServer
        />
      </Group>
    </>
  );
};

