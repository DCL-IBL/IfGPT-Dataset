# IfGPT Dataset


## Objective of the project
The project aims to develop a freely accessible infrastructure for the selection and pre-processing of large datasets for Bulgarian as well as tailored data for particular industries and fine-tuning suitable freely available large language models for specific purposes.

## IfGPT Dataset

IfGPT Dataset is a large language dataset containing some already available corpora and datasets for Bulgarian, as well as methods for its continuous expansion with non-duplicated, clean Bulgarian data. The samples in the dataset are annotated with metadata that enable effective extraction of domain- and application-oriented datasets. The extended metadata of the IfGPT Dataset is managed through a graph-based database.

The aim of the **IfGPT Dataset** is to avoid the redundant compilation of datasets by different users and the multiple efforts for cleaning the data and to facilitate the reuse of the data for solving different application tasks. The main contribution of our work can be summarised as follows:

(a) Merging several relatively large text collections for Bulgarian into one dataset with standardised metadata description and document formats.

(b) Adding new texts to the dataset in a standardised way.

(c) Deploying and customising a set of tools in a chain for text cleaning, deduplication, detection of sensitive and biassed information to ensure the quality of the data.

(d) Providing a uniform metadata description for all documents in the datasets and organising the metadata categories in a graph representation, originally proposed for the [Bulgarian National Corpus](https://dcl.bas.bg/bulnc/) and extended to the present **IfGPT** dataset.

(e) Providing means to efficiently query metadata to find suitable text documents for a given LLM fine-tuning or Retrieval Augmented Generation (RAG) task.

## IfGPT Metadata Management

The metadata is organised and managed in a Neo4j graph database, with multiple node types (Document, License, Source) whose relations reflect the actual dependencies among the metadata categories. The resulting system of nodes and edges provides a flexible representation that supports both the extraction of subsets from the overall collection and the execution of secondary tasks of data analysis and statistical overview.


Metadata is visualised here: https://ifgpt.dcl.bas.bg/ifgpt-dataset/

## Repository contents


### `neo4j_query_table_data_2026-5-26.csv`
Export of all `Document` nodes from the Neo4j database. Columns: `Identifier`, `DocumentTitle`, `URL`, `Subdomain`, `PublicationDate`, `CollectionDate`, `LicenceLink`, `NumberParagraphs`, `NumberSentences`, `NumberWords`, `NumberTokens`.

### `ifgpt-dataset-queries.cypher`
Cypher queries used by the IfGPT search interface against the Neo4j database. Includes the graph schema (Document, Licence, LicenceCategory, Domain, Author, Style, Type, Medium and their relationships) and seven documented queries: total document count, licence and domain lookups, the dynamic filtered search, stats (count + word sum), and the paginated/full-export result query with all related entities collected into arrays.

### `ifgpt-dataset-search.js`
Browser-side JavaScript that connects to Neo4j via `neo4j-driver` and powers the search widget. Builds Cypher queries dynamically from the filter form (licence category, licence, domain, year range, keywords), runs paginated searches (20 per page), renders results, and exports the full filtered result set as JSON in batches of 200.


__________________________________________

This work is part of the project **Infrastructure for Fine-tuning Pre-trained Large Language Models**, Grant Agreement No. ПВУ – 55 from 12.12.2024 /BG-RRP-2.017-0030-C01/.

https://ifgpt.dcl.bas.bg/en/
