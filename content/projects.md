## Intent-Based RAG Pipeline (Article)
- Built a RAG pipeline over an unstructured literary text (Dostoevsky’s White Nights) with an intent classifier that routes each
query to a dynamically weighted blend of BM25, dense, and metadata retrieval.
- Implemented and benchmarked an LLM-judge reranker and a ReAct-style agentic retrieval loop (search / lookup / finish)
against the pipeline baseline across iterations, showing the tuned formula matched or beat both alternatives on this corpus.

## Benchmarking Vector Databases for Agentic Memory (KTH Coursework Project)
- Benchmarking Qdrant and PostgreSQL (pgvector) as memory stores for LLM agents, measuring recall, latency.
- Built a gold dataset simulating Generative Agents (Simulacra)-style memory for 100 agents, generating observations and
reflections with gpt-4o-mini and embedding them with text-embedding-3-small.
- Built a brute-force retrieval pipeline to produce ground-truth results and a replayable workload trace of inserts, retrievals, and
updates, used to score both databases identically.


## SocialBetting 
- A decentralized social betting platform designed for small groups of friends or communities. Create custom bets as smart
contracts, lock funds on-chain, and rely on transparent smart contract execution for payouts.
- Implemented Metamask wallet integration for deploying a bet contract on the testnet.
- Deployed on Sepolia Testnet.
- Built using Solidity, TypeScript, React, Web3.js, MetaMask

Link : https://github.com/Val0007/Social-Betting---Blockchain-course-final-Project

## SpotifyPlaylist-DL
- Developed a web application that enables users to download Spotify playlists.
- Used Spotify’s OAuth 2.0 for secure user authentication and playlist retrieval.
- Integrated YTMusic API to identify corresponding tracks.
- Utilized youtube-dl and FFmpeg to download and convert audio files into MP3 format.

Link: https://github.com/Val0007/spotifyDownloader

## Stepout.site 
- Built a full-stack web application for discovering location-based weekend offers, coupons, and events, aimed at reducing indecision in weekend planning.
- Integrated Supabase authentication and PostgreSQL
- Implemented a Redis caching layer for area-specific offer data
- Used Supabase webhooks to automatically invalidate/update cache entries
- Deployed on DigitalOcean and Vercel
- Built using ReactJS, NodeJS, Supabase (PostgreSQL, Auth, Triggers, Webhooks), Redis, DigitalOcean

Link: https://github.com/Val0007/Stepout-Client

---
