// ============================================================================
// IfGPT Dataset — Cypher queries
// Source: IfGPT search WordPress widget (https://ifgpt.dcl.bas.bg)
// Graph schema:
//   (:Document)-[:LICENSED_WITH]->(:Licence)-[:HAS_LICENCE_CATEGORY]->(:LicenceCategory)
//   (:Document)-[:BELONGS_TO]->(:Domain)
//   (:Domain)-[:SUBCATEGORY_OF]->(:Domain)
//   (:Document)-[:WRITTEN_BY]->(:Author)
//   (:Document)-[:HAS_STYLE]->(:Style)
//   (:Document)-[:HAS_TYPE]->(:Type)
//   (:Document)-[:HAS_MEDIUM]->(:Medium)
// Document properties:
//   Identifier, DocumentTitle, URL, PublicationDate, CollectionDate,
//   LicenceLink, Subdomain, NumberParagraphs, NumberSentences,
//   NumberWords, NumberTokens
// ============================================================================


// ----------------------------------------------------------------------------
// 1. Total document count (used in the header subtitle)
// ----------------------------------------------------------------------------
MATCH (m:Document)
RETURN count(m) AS total;


// ----------------------------------------------------------------------------
// 2. All licences (populates the Licence checkbox list)
// ----------------------------------------------------------------------------
MATCH (l:Licence)
RETURN l.Type AS licence
ORDER BY l.Type;


// ----------------------------------------------------------------------------
// 3. Top-level domains only (populates the Domain checkbox list)
//    Excludes sub-domains that have a SUBCATEGORY_OF edge to a parent Domain.
// ----------------------------------------------------------------------------
MATCH (dom:Domain)
WHERE NOT (dom)-[:SUBCATEGORY_OF]->(:Domain)
RETURN dom.Name AS domain
ORDER BY domain;


// ----------------------------------------------------------------------------
// 4. Filtered search — total count
//    Optional MATCH clauses and WHERE conditions are added by buildQuery().
//    Parameters that may be passed in:
//      $categories : ["free", "restricted"]
//      $licences   : ["CC-BY-SA-4.0", ...]
//      $domains    : ["POLITICS", ...]
//      $dateFrom   : "2010-01-01"
//      $dateTo     : "2020-12-31"
//      $kw0..$kwN  : keyword strings matched against DocumentTitle
// ----------------------------------------------------------------------------
MATCH (d:Document)
MATCH (d)-[:LICENSED_WITH]->(licCatNode:Licence)-[:HAS_LICENCE_CATEGORY]->(catNode:LicenceCategory)
MATCH (d)-[:LICENSED_WITH]->(licNode:Licence)
MATCH (d)-[:BELONGS_TO]->(domNode:Domain)
WHERE catNode.Name IN $categories
  AND licNode.Type IN $licences
  AND domNode.Name IN $domains
  AND d.PublicationDate >= $dateFrom
  AND d.PublicationDate <= $dateTo
  AND (toLower(d.DocumentTitle) CONTAINS toLower($kw0)
       OR toLower(d.DocumentTitle) CONTAINS toLower($kw1))
RETURN count(DISTINCT d) AS total;


// ----------------------------------------------------------------------------
// 5. Filtered search — sum of words
//    Same WHERE as above, plus d.NumberWords IS NOT NULL.
// ----------------------------------------------------------------------------
MATCH (d:Document)
// ...same optional MATCH/WHERE clauses as query 4...
  AND d.NumberWords IS NOT NULL
RETURN sum(d.NumberWords) AS total;


// ----------------------------------------------------------------------------
// 6. Paginated result page (20 docs per page) with all related entities
//    $skip, $limit are Neo4j integers.
// ----------------------------------------------------------------------------
MATCH (d:Document)
// ...optional MATCH/WHERE clauses from buildQuery()...
WITH DISTINCT d
ORDER BY d.DocumentTitle
SKIP $skip LIMIT $limit
OPTIONAL MATCH (d)-[:WRITTEN_BY]->(aN:Author)
OPTIONAL MATCH (d)-[:BELONGS_TO]->(dN:Domain)
OPTIONAL MATCH (d)-[:LICENSED_WITH]->(lN:Licence)
OPTIONAL MATCH (d)-[:HAS_STYLE]->(sN:Style)
OPTIONAL MATCH (d)-[:HAS_TYPE]->(tN:Type)
OPTIONAL MATCH (d)-[:HAS_MEDIUM]->(mN:Medium)
WITH d,
     collect(DISTINCT aN.Name) AS authors,
     collect(DISTINCT dN.Name) AS domains,
     collect(DISTINCT lN.Type) AS licences,
     collect(DISTINCT sN.Name) AS styles,
     collect(DISTINCT tN.Name) AS types,
     collect(DISTINCT mN.Name) AS mediums
RETURN d.Identifier       AS id,
       d.DocumentTitle    AS title,
       authors,
       domains,
       licences,
       styles,
       types,
       d.PublicationDate  AS pubDate,
       d.URL              AS url,
       d.NumberParagraphs AS paragraphs,
       d.NumberSentences  AS sentences,
       d.NumberWords      AS words,
       mediums;


// ----------------------------------------------------------------------------
// 7. Full export query (same shape as #6 but called in batches of 200)
//    Use without LIMIT/SKIP to fetch everything, or iterate as in JS code.
// ----------------------------------------------------------------------------
MATCH (d:Document)
WITH DISTINCT d
ORDER BY d.DocumentTitle
OPTIONAL MATCH (d)-[:WRITTEN_BY]->(aN:Author)
OPTIONAL MATCH (d)-[:BELONGS_TO]->(dN:Domain)
OPTIONAL MATCH (d)-[:LICENSED_WITH]->(lN:Licence)
OPTIONAL MATCH (d)-[:HAS_STYLE]->(sN:Style)
OPTIONAL MATCH (d)-[:HAS_TYPE]->(tN:Type)
OPTIONAL MATCH (d)-[:HAS_MEDIUM]->(mN:Medium)
RETURN d.Identifier       AS id,
       d.DocumentTitle    AS title,
       collect(DISTINCT aN.Name) AS authors,
       collect(DISTINCT dN.Name) AS domains,
       collect(DISTINCT lN.Type) AS licences,
       collect(DISTINCT sN.Name) AS styles,
       collect(DISTINCT tN.Name) AS types,
       d.PublicationDate  AS pubDate,
       d.URL              AS url,
       d.NumberParagraphs AS paragraphs,
       d.NumberSentences  AS sentences,
       d.NumberWords      AS words,
       collect(DISTINCT mN.Name) AS mediums;
