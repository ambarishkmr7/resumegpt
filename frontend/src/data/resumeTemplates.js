// Free resume templates — pure data + a builder that produces a full
// ResumeContent object (matching the backend schema) for each role.
// No React/browser APIs, so it's importable by pages, the panel, SEO config,
// and the prerender script.

const SAMPLE_NAMES = ["Aarav Sharma", "Priya Nair", "Rohan Mehta", "Ananya Iyer", "Vikram Rao", "Sneha Kulkarni"];
const CITIES = ["Bengaluru, India", "Hyderabad, India", "Pune, India", "Mumbai, India", "Gurugram, India", "Chennai, India"];

// Each role: slug, label (display), role (job title), objective (summary),
// skills, competencies, j1/j2 = three achievement bullets per role, degree,
// certs, coverHook (one role-specific line for the cover letter).
export const TEMPLATES = [
  {
    slug: "software-engineer", label: "Software Engineer Resume", role: "Software Engineer",
    objective: "Results-driven Software Engineer with a track record of shipping scalable, well-tested services. Passionate about clean architecture, performance, and delivering measurable product impact.",
    skills: ["Java", "Python", "JavaScript", "Spring Boot", "REST APIs", "SQL", "Git", "AWS"],
    competencies: ["System Design", "Code Review", "Agile/Scrum", "CI/CD", "Unit Testing"],
    j1: ["Designed and shipped microservices handling 5M+ daily requests at 99.95% uptime.", "Cut API p95 latency by 38% through query optimization and caching.", "Led code reviews and mentored 3 junior engineers."],
    j2: ["Built REST APIs powering the customer-facing web app used by 200K users.", "Automated regression testing, reducing release defects by 30%.", "Migrated a monolith module to a service, improving deploy frequency."],
    degree: "B.Tech, Computer Science", certs: ["AWS Certified Developer – Associate", "Oracle Certified Java Programmer"],
    coverHook: "building reliable, scalable backend systems that delight users",
  },
  {
    slug: "java-developer", label: "Java Developer Resume", role: "Java Developer",
    objective: "Java Developer specializing in Spring-based microservices and high-throughput backend systems. Strong in JVM performance tuning and distributed design.",
    skills: ["Java 17", "Spring Boot", "Hibernate", "Microservices", "Kafka", "PostgreSQL", "Docker", "JUnit"],
    competencies: ["Microservices", "JVM Tuning", "TDD", "Event-Driven Design", "REST/GraphQL"],
    j1: ["Developed Spring Boot microservices processing 2M+ transactions per day.", "Reduced memory footprint 25% via JVM and GC tuning.", "Introduced Kafka-based event streaming for order processing."],
    j2: ["Built reusable Hibernate data-access layer adopted across 6 teams.", "Achieved 85% unit-test coverage with JUnit and Mockito.", "Containerized services with Docker for consistent deployments."],
    degree: "B.E., Information Technology", certs: ["Spring Professional Certified", "AWS Certified Developer – Associate"],
    coverHook: "engineering robust Java microservices that scale under load",
  },
  {
    slug: "python-developer", label: "Python Developer Resume", role: "Python Developer",
    objective: "Python Developer with expertise in building APIs, automation, and data pipelines. Focused on clean, maintainable code and rapid, reliable delivery.",
    skills: ["Python", "FastAPI", "Django", "Pandas", "PostgreSQL", "Celery", "Docker", "pytest"],
    competencies: ["API Development", "Automation", "Data Pipelines", "Async Programming", "Testing"],
    j1: ["Built FastAPI services powering a SaaS product with 150K monthly users.", "Automated ETL pipelines that saved 20+ engineering hours weekly.", "Improved test coverage to 90% using pytest and CI."],
    j2: ["Developed Django admin tooling that cut manual ops work by 40%.", "Optimized Pandas data processing, reducing job runtime by 55%.", "Introduced Celery task queues for reliable background jobs."],
    degree: "B.Sc., Computer Science", certs: ["PCEP – Certified Entry-Level Python Programmer", "AWS Certified Cloud Practitioner"],
    coverHook: "shipping clean Python services and automation that save real time",
  },
  {
    slug: "react-developer", label: "React Developer Resume", role: "React Developer",
    objective: "Front-end Developer specializing in React and modern JavaScript. Builds fast, accessible, pixel-perfect interfaces with a strong eye for UX.",
    skills: ["React", "TypeScript", "Redux", "Next.js", "JavaScript (ES6+)", "HTML5/CSS3", "Jest", "Vite"],
    competencies: ["Component Architecture", "Accessibility (a11y)", "Performance", "Responsive Design", "State Management"],
    j1: ["Built a React component library adopted across 4 product teams.", "Improved Largest Contentful Paint by 45% via code-splitting and lazy loading.", "Shipped an accessible (WCAG AA) redesign that lifted conversion 12%."],
    j2: ["Migrated a legacy app to React + TypeScript, cutting bugs 30%.", "Implemented Redux state management for a complex dashboard.", "Set up Jest + React Testing Library, reaching 80% coverage."],
    degree: "B.Tech, Computer Science", certs: ["Meta Front-End Developer Professional Certificate", "freeCodeCamp Responsive Web Design"],
    coverHook: "crafting fast, accessible React interfaces users love",
  },
  {
    slug: "devops-engineer", label: "DevOps Resume", role: "DevOps Engineer",
    objective: "DevOps Engineer automating CI/CD, infrastructure, and observability. Drives reliability and faster, safer releases through infrastructure-as-code.",
    skills: ["Kubernetes", "Docker", "Terraform", "AWS", "Jenkins", "Prometheus", "Ansible", "Bash"],
    competencies: ["CI/CD", "Infrastructure as Code", "Observability", "Incident Response", "Cloud Security"],
    j1: ["Built CI/CD pipelines that cut deployment time from hours to 8 minutes.", "Managed Kubernetes clusters running 120+ microservices.", "Reduced cloud spend 28% via right-sizing and autoscaling."],
    j2: ["Codified infrastructure with Terraform across 3 environments.", "Set up Prometheus/Grafana monitoring, cutting MTTR by 50%.", "Automated zero-downtime blue-green deployments."],
    degree: "B.E., Computer Science", certs: ["Certified Kubernetes Administrator (CKA)", "AWS Certified DevOps Engineer – Professional"],
    coverHook: "automating delivery pipelines and infrastructure for safer, faster releases",
  },
  {
    slug: "cloud-architect", label: "Cloud Architect Resume", role: "Cloud Architect",
    objective: "Cloud Architect designing secure, cost-efficient, highly available systems on AWS and Azure. Translates business goals into resilient cloud architectures.",
    skills: ["AWS", "Azure", "Terraform", "Kubernetes", "Microservices", "Networking", "Security", "Cost Optimization"],
    competencies: ["Cloud Strategy", "High Availability", "Security Architecture", "Cost Governance", "Migration"],
    j1: ["Architected a multi-region platform serving 10M users at 99.99% availability.", "Led cloud migration of 60+ workloads, cutting infra cost 35%.", "Established landing-zone and security guardrails org-wide."],
    j2: ["Designed event-driven architecture reducing processing cost 40%.", "Implemented disaster-recovery with <15 min RTO.", "Mentored teams on Well-Architected best practices."],
    degree: "M.Tech, Computer Science", certs: ["AWS Certified Solutions Architect – Professional", "Microsoft Certified: Azure Solutions Architect Expert"],
    coverHook: "designing resilient, cost-smart cloud architectures that scale",
  },
  {
    slug: "data-scientist", label: "Data Scientist Resume", role: "Data Scientist",
    objective: "Data Scientist turning data into decisions with ML, statistics, and clear storytelling. Delivers models that move business metrics.",
    skills: ["Python", "SQL", "scikit-learn", "TensorFlow", "Pandas", "Statistics", "A/B Testing", "Tableau"],
    competencies: ["Machine Learning", "Experimentation", "Feature Engineering", "Data Storytelling", "MLOps"],
    j1: ["Built a churn model that reduced customer attrition by 18%.", "Designed A/B tests informing a roadmap that lifted revenue 9%.", "Productionized ML pipelines serving real-time predictions."],
    j2: ["Developed demand-forecasting models cutting stockouts 22%.", "Created executive dashboards adopted by leadership.", "Mentored analysts on statistical rigor and ML basics."],
    degree: "M.Sc., Data Science / Statistics", certs: ["TensorFlow Developer Certificate", "AWS Certified Machine Learning – Specialty"],
    coverHook: "building ML models that turn data into measurable business value",
  },
  {
    slug: "data-analyst", label: "Data Analyst Resume", role: "Data Analyst",
    objective: "Data Analyst skilled in SQL, dashboards, and insight storytelling. Helps teams make confident, data-backed decisions.",
    skills: ["SQL", "Excel", "Power BI", "Tableau", "Python", "Statistics", "Data Cleaning", "Looker"],
    competencies: ["Reporting", "Data Visualization", "KPI Definition", "Stakeholder Analysis", "ETL"],
    j1: ["Built self-serve dashboards that cut ad-hoc report requests 60%.", "Identified revenue leakage worth ₹1.2Cr through cohort analysis.", "Standardized KPI definitions across 5 departments."],
    j2: ["Automated weekly reporting, saving 15 hours per week.", "Partnered with marketing to optimize spend, improving ROAS 20%.", "Cleaned and modeled data for a company-wide BI migration."],
    degree: "B.Sc., Statistics / Economics", certs: ["Microsoft Power BI Data Analyst Associate", "Google Data Analytics Professional Certificate"],
    coverHook: "turning messy data into clear dashboards and decisions",
  },
  {
    slug: "ai-architect", label: "AI Architect Resume", role: "AI Architect",
    objective: "AI Architect designing end-to-end machine learning and GenAI systems. Bridges research and production to deliver trustworthy, scalable AI.",
    skills: ["LLMs", "Python", "PyTorch", "MLOps", "Vector Databases", "RAG", "Kubernetes", "AWS SageMaker"],
    competencies: ["AI Strategy", "LLM/RAG Systems", "MLOps", "Model Governance", "Scalable Inference"],
    j1: ["Architected a RAG platform that cut support resolution time 40%.", "Defined the org's MLOps and model-governance standards.", "Scaled inference to 1M+ daily requests with cost controls."],
    j2: ["Led GenAI adoption across 4 product lines.", "Built evaluation pipelines reducing hallucinations 35%.", "Mentored ML engineers on production AI best practices."],
    degree: "M.Tech / M.S., Artificial Intelligence", certs: ["AWS Certified Machine Learning – Specialty", "Google Cloud Professional ML Engineer"],
    coverHook: "architecting production-grade AI and LLM systems that earn trust",
  },
  {
    slug: "project-manager", label: "Project Manager Resume", role: "Project Manager",
    objective: "Project Manager delivering complex programs on time and on budget. Aligns stakeholders, manages risk, and keeps teams focused on outcomes.",
    skills: ["Agile/Scrum", "JIRA", "Risk Management", "Stakeholder Management", "Budgeting", "Roadmapping", "MS Project", "Reporting"],
    competencies: ["Program Delivery", "Risk Management", "Stakeholder Alignment", "Resource Planning", "Agile Coaching"],
    j1: ["Delivered a ₹12Cr program across 5 teams, on time and 8% under budget.", "Cut delivery delays 30% by introducing agile ceremonies.", "Managed risk register and stakeholder comms for C-level."],
    j2: ["Led cross-functional rollout impacting 50K users.", "Improved sprint predictability from 60% to 90%.", "Coached two teams through agile transformation."],
    degree: "MBA / B.Tech", certs: ["PMP – Project Management Professional", "Certified ScrumMaster (CSM)"],
    coverHook: "delivering complex programs on time, on budget, with aligned teams",
  },
  {
    slug: "technical-architect", label: "Technical Architect Resume", role: "Technical Architect",
    objective: "Technical Architect defining scalable, secure system designs and engineering standards. Guides teams from concept to production.",
    skills: ["System Design", "Microservices", "Java/Spring", "Kubernetes", "Event-Driven Architecture", "API Design", "Security", "Cloud"],
    competencies: ["Solution Architecture", "Tech Standards", "Scalability", "Mentorship", "Design Reviews"],
    j1: ["Defined the architecture for a platform serving 8M users.", "Established API and security standards adopted org-wide.", "Reduced incident rate 40% via resilience patterns."],
    j2: ["Led design reviews across 6 squads.", "Drove a microservices migration improving deploy speed 3x.", "Mentored senior engineers into tech leads."],
    degree: "B.Tech / M.Tech, Computer Science", certs: ["AWS Certified Solutions Architect – Professional", "TOGAF 9 Certified"],
    coverHook: "setting the technical direction for systems that scale safely",
  },
  {
    slug: "solution-architect", label: "Solution Architect Resume", role: "Solution Architect",
    objective: "Solution Architect translating business needs into robust technical solutions. Balances cost, risk, and speed across the delivery lifecycle.",
    skills: ["Solution Design", "Cloud (AWS/Azure)", "Integration", "Microservices", "APIs", "Security", "Stakeholder Management", "Cost Optimization"],
    competencies: ["Solutioning", "Pre-Sales", "Integration Design", "Cloud Strategy", "Governance"],
    j1: ["Designed solutions for enterprise clients worth ₹40Cr in deals.", "Reduced integration timelines 35% with reusable patterns.", "Led architecture governance for 12 projects."],
    j2: ["Partnered with sales to win 6 strategic accounts.", "Standardized API integration across partner ecosystem.", "Optimized cloud TCO by 30% for a key client."],
    degree: "B.E. / MBA", certs: ["AWS Certified Solutions Architect – Professional", "Microsoft Certified: Azure Solutions Architect Expert"],
    coverHook: "turning business goals into solutions that balance cost, risk, and speed",
  },
  {
    slug: "enterprise-architect", label: "Enterprise Architect Resume", role: "Enterprise Architect",
    objective: "Enterprise Architect aligning technology strategy with business vision. Drives standards, modernization, and value across the organization.",
    skills: ["Enterprise Architecture", "TOGAF", "Cloud Strategy", "Digital Transformation", "Governance", "Roadmapping", "Security", "Integration"],
    competencies: ["EA Frameworks", "Tech Strategy", "Modernization", "Governance", "Portfolio Planning"],
    j1: ["Defined a 3-year tech roadmap enabling ₹100Cr digital initiatives.", "Led modernization retiring 40% of legacy systems.", "Established EA governance across 8 business units."],
    j2: ["Aligned IT investments to business OKRs, improving ROI 22%.", "Created reference architectures adopted enterprise-wide.", "Advised the CIO on cloud and security strategy."],
    degree: "MBA / M.Tech", certs: ["TOGAF 9 Certified", "AWS Certified Solutions Architect – Professional"],
    coverHook: "aligning enterprise technology strategy with business value",
  },
  {
    slug: "cto", label: "CTO Resume", role: "Chief Technology Officer (CTO)",
    objective: "Technology executive scaling engineering organizations and product platforms. Builds high-performing teams and a culture of delivery and innovation.",
    skills: ["Technology Strategy", "Engineering Leadership", "Cloud & Scalability", "Product Strategy", "Hiring & Org Design", "Budgeting", "Security", "Innovation"],
    competencies: ["Executive Leadership", "Org Scaling", "Tech Strategy", "P&L Ownership", "Board Reporting"],
    j1: ["Scaled engineering from 15 to 120 while improving delivery velocity.", "Drove platform re-architecture supporting 10x user growth.", "Owned a ₹60Cr tech budget with strong ROI."],
    j2: ["Set technology vision and 3-year roadmap with the board.", "Built security and compliance posture achieving SOC 2.", "Established hiring brand attracting senior talent."],
    degree: "B.Tech + MBA", certs: ["Executive Leadership Program", "AWS Certified Solutions Architect – Professional"],
    coverHook: "scaling engineering orgs and platforms while shipping fast",
  },
  {
    slug: "cfo", label: "CFO Resume", role: "Chief Financial Officer (CFO)",
    objective: "Finance executive driving profitable growth, capital strategy, and operational discipline. Trusted partner to the CEO and board.",
    skills: ["Financial Strategy", "FP&A", "Fundraising", "M&A", "Controls & Compliance", "Treasury", "Investor Relations", "Budgeting"],
    competencies: ["Corporate Finance", "Capital Strategy", "Risk & Controls", "M&A", "Board Reporting"],
    j1: ["Led a ₹250Cr fundraise and improved gross margin 6 points.", "Built FP&A function improving forecast accuracy to 96%.", "Drove cost optimization saving ₹30Cr annually."],
    j2: ["Managed two acquisitions and post-merger integration.", "Strengthened controls, achieving a clean audit.", "Owned investor relations and board financial reporting."],
    degree: "CA / MBA (Finance)", certs: ["Chartered Accountant (CA)", "CFA Charterholder"],
    coverHook: "driving profitable growth through disciplined finance strategy",
  },
  {
    slug: "cybersecurity-analyst", label: "Cyber Security Analyst Resume", role: "Cyber Security Analyst",
    objective: "Cyber Security Analyst protecting systems through monitoring, threat hunting, and incident response. Reduces risk and strengthens security posture.",
    skills: ["SIEM", "Incident Response", "Threat Hunting", "Vulnerability Management", "Network Security", "Python", "OWASP", "Cloud Security"],
    competencies: ["SOC Operations", "Incident Response", "Risk Assessment", "Threat Intelligence", "Compliance"],
    j1: ["Cut incident detection time 50% by tuning SIEM correlation rules.", "Led response to and contained a phishing breach within 2 hours.", "Reduced critical vulnerabilities 70% via a remediation program."],
    j2: ["Ran threat-hunting that uncovered persistent access attempts.", "Implemented MFA and zero-trust controls across the org.", "Achieved ISO 27001 readiness through controls hardening."],
    degree: "B.Tech, Computer Science / Cyber Security", certs: ["CompTIA Security+", "Certified Ethical Hacker (CEH)"],
    coverHook: "defending systems through proactive threat hunting and fast response",
  },
  {
    slug: "data-engineer", label: "Data Engineer Resume", role: "Data Engineer",
    objective: "Data Engineer building reliable, scalable data platforms and pipelines. Delivers trusted, analytics-ready data at scale.",
    skills: ["Python", "SQL", "Spark", "Airflow", "Kafka", "Snowflake", "dbt", "AWS"],
    competencies: ["Data Pipelines", "Data Modeling", "Streaming", "Data Quality", "Warehousing"],
    j1: ["Built Spark/Airflow pipelines processing 5TB+ daily.", "Reduced pipeline failures 60% with testing and monitoring.", "Designed a Snowflake warehouse cutting query cost 30%."],
    j2: ["Implemented real-time Kafka streaming for event analytics.", "Introduced dbt models improving data trust and lineage.", "Migrated legacy ETL to a modern ELT stack."],
    degree: "B.Tech, Computer Science", certs: ["AWS Certified Data Engineer – Associate", "Databricks Certified Data Engineer Associate"],
    coverHook: "building dependable data platforms that analytics teams trust",
  },
  {
    slug: "teacher", label: "Teacher Resume", role: "Teacher",
    objective: "Dedicated Teacher fostering curiosity and measurable learning outcomes. Creates inclusive, engaging classrooms where every student grows.",
    skills: ["Lesson Planning", "Classroom Management", "Curriculum Design", "Assessment", "EdTech Tools", "Differentiated Instruction", "Communication", "Mentoring"],
    competencies: ["Pedagogy", "Student Engagement", "Assessment Design", "Parent Communication", "Inclusive Teaching"],
    j1: ["Improved class average scores by 22% over two academic years.", "Designed project-based curriculum boosting engagement.", "Mentored 15 students to district-level competitions."],
    j2: ["Integrated EdTech tools raising participation in remote classes.", "Led parent-teacher programs improving attendance.", "Supported diverse learners with differentiated plans."],
    degree: "B.Ed. / M.A.", certs: ["B.Ed. Certified", "CTET Qualified"],
    coverHook: "creating engaging classrooms where every student measurably grows",
  },
  {
    slug: "mba", label: "MBA Resume", role: "MBA Graduate / Business Manager",
    objective: "MBA professional combining analytical rigor with leadership to drive growth. Skilled across strategy, operations, and cross-functional execution.",
    skills: ["Business Strategy", "Financial Analysis", "Market Research", "Operations", "Stakeholder Management", "Excel", "SQL", "Leadership"],
    competencies: ["Strategy", "Analytics", "Operations", "Go-to-Market", "Leadership"],
    j1: ["Led a market-entry strategy projected to add ₹20Cr revenue.", "Optimized operations, improving margin 5 points.", "Managed a cross-functional team of 8 on a key initiative."],
    j2: ["Built financial models guiding investment decisions.", "Ran customer research that reshaped the product roadmap.", "Drove a process redesign cutting cycle time 25%."],
    degree: "MBA", certs: ["Lean Six Sigma Green Belt", "Financial Modeling & Valuation Analyst (FMVA)"],
    coverHook: "pairing analytical rigor with leadership to drive business growth",
  },
  {
    slug: "sales", label: "Sales Resume", role: "Sales Manager",
    objective: "Sales professional consistently exceeding targets through consultative selling and relationship building. Drives revenue and lasting client trust.",
    skills: ["B2B Sales", "Negotiation", "CRM (Salesforce)", "Pipeline Management", "Account Management", "Prospecting", "Forecasting", "Closing"],
    competencies: ["Revenue Growth", "Consultative Selling", "Key Accounts", "Pipeline Management", "Team Leadership"],
    j1: ["Exceeded quota 130% for 6 consecutive quarters.", "Grew a key account portfolio from ₹5Cr to ₹14Cr.", "Built a pipeline process improving close rate 18%."],
    j2: ["Led a team of 6 reps to 115% of regional target.", "Closed the largest deal in company history (₹6Cr).", "Reduced sales cycle 20% with better qualification."],
    degree: "BBA / MBA (Marketing)", certs: ["Salesforce Certified Administrator", "SPIN Selling Certified"],
    coverHook: "exceeding targets through consultative selling and trusted relationships",
  },
  {
    slug: "hr", label: "HR Resume", role: "HR Manager",
    objective: "HR professional building people-first cultures and effective talent programs. Aligns HR strategy with business goals to drive engagement and retention.",
    skills: ["Talent Acquisition", "Employee Engagement", "HRIS", "Performance Management", "L&D", "Policy", "Compensation", "Conflict Resolution"],
    competencies: ["Talent Strategy", "Employee Relations", "HR Operations", "Culture Building", "Compliance"],
    j1: ["Reduced time-to-hire 35% by revamping the recruiting process.", "Improved retention 15% via engagement and L&D programs.", "Rolled out a performance framework across 300 employees."],
    j2: ["Led HRIS implementation streamlining operations.", "Designed a DEI initiative improving belonging scores.", "Managed employee relations with high satisfaction."],
    degree: "MBA (HR) / MSW", certs: ["SHRM-CP", "HR Analytics Certificate"],
    coverHook: "building people-first cultures that boost engagement and retention",
  },
  {
    slug: "civil-engineer", label: "Civil Engineer Resume", role: "Civil Engineer",
    objective: "Civil Engineer delivering infrastructure projects safely, on time, and within budget. Strong in design, site management, and quality control.",
    skills: ["AutoCAD", "STAAD.Pro", "Project Planning", "Site Management", "Quantity Surveying", "Quality Control", "Safety Compliance", "MS Project"],
    competencies: ["Structural Design", "Site Execution", "Cost Estimation", "Quality Assurance", "Safety"],
    j1: ["Managed a ₹45Cr commercial build delivered 2 months early.", "Cut material waste 12% via better estimation.", "Maintained a zero lost-time-injury safety record."],
    j2: ["Supervised structural design for a 14-storey project.", "Coordinated 80+ workers and multiple subcontractors.", "Implemented QA processes reducing rework 20%."],
    degree: "B.E., Civil Engineering", certs: ["PMP", "OSHA Construction Safety"],
    coverHook: "delivering infrastructure safely, on time, and on budget",
  },
  {
    slug: "mechanical-engineer", label: "Mechanical Engineer Resume", role: "Mechanical Engineer",
    objective: "Mechanical Engineer designing reliable products and optimizing manufacturing. Combines CAD/CAE expertise with a continuous-improvement mindset.",
    skills: ["SolidWorks", "AutoCAD", "ANSYS", "GD&T", "Manufacturing", "Lean", "Six Sigma", "Project Management"],
    competencies: ["Product Design", "CAE/Simulation", "Manufacturing", "Process Improvement", "Quality"],
    j1: ["Designed components cutting product cost 15% without quality loss.", "Ran FEA reducing field failures 25%.", "Led a lean project improving line throughput 18%."],
    j2: ["Developed CAD models and drawings for new product lines.", "Implemented Six Sigma reducing defects 30%.", "Coordinated with vendors to improve part quality."],
    degree: "B.E., Mechanical Engineering", certs: ["Six Sigma Green Belt", "Certified SolidWorks Professional"],
    coverHook: "designing reliable products and optimizing how they're made",
  },
  {
    slug: "nurse", label: "Nurse Resume", role: "Registered Nurse",
    objective: "Compassionate Registered Nurse delivering safe, patient-centered care. Calm under pressure, with strong clinical judgment and teamwork.",
    skills: ["Patient Care", "Vitals Monitoring", "Medication Administration", "EMR", "Triage", "IV Therapy", "Patient Education", "Infection Control"],
    competencies: ["Clinical Care", "Patient Safety", "Critical Thinking", "Documentation", "Team Coordination"],
    j1: ["Cared for up to 12 patients per shift with high satisfaction scores.", "Reduced medication errors through diligent verification.", "Trained 6 new nurses on unit protocols."],
    j2: ["Supported ICU patients with complex care needs.", "Maintained accurate EMR documentation and handoffs.", "Led an infection-control initiative reducing HAIs."],
    degree: "B.Sc., Nursing (BSN)", certs: ["Registered Nurse (RN) License", "Basic Life Support (BLS)"],
    coverHook: "delivering safe, compassionate, patient-centered care",
  },
  {
    slug: "doctor", label: "Doctor Resume", role: "Physician",
    objective: "Physician dedicated to evidence-based, compassionate patient care. Strong diagnostic skills and a commitment to continuous learning.",
    skills: ["Clinical Diagnosis", "Patient Care", "Treatment Planning", "EMR", "Emergency Medicine", "Medical Research", "Communication", "Teamwork"],
    competencies: ["Diagnosis & Treatment", "Patient Safety", "Clinical Research", "Mentoring", "Ethics"],
    j1: ["Managed 25+ patients daily with strong outcomes.", "Reduced average diagnosis time through structured workups.", "Mentored interns and residents on clinical best practices."],
    j2: ["Led a quality initiative improving discharge accuracy.", "Contributed to peer-reviewed research publications.", "Maintained excellent patient-satisfaction ratings."],
    degree: "MBBS / MD", certs: ["Medical License (MCI/NMC)", "Advanced Cardiac Life Support (ACLS)"],
    coverHook: "providing evidence-based, compassionate care with sound judgment",
  },
  {
    slug: "pharmacist", label: "Pharmacist Resume", role: "Pharmacist",
    objective: "Licensed Pharmacist ensuring safe, accurate medication therapy and patient counseling. Detail-oriented with strong clinical knowledge.",
    skills: ["Dispensing", "Medication Therapy Management", "Patient Counseling", "Inventory Management", "Drug Interactions", "Compliance", "EMR", "Compounding"],
    competencies: ["Medication Safety", "Patient Counseling", "Regulatory Compliance", "Inventory Control", "Clinical Knowledge"],
    j1: ["Dispensed 200+ prescriptions daily with a 99.9% accuracy rate.", "Counseled patients, improving medication adherence.", "Reduced inventory waste 18% via better stock control."],
    j2: ["Identified and prevented harmful drug interactions.", "Ensured full regulatory compliance during audits.", "Trained pharmacy interns on safe dispensing."],
    degree: "B.Pharm / Pharm.D", certs: ["Registered Pharmacist License", "Immunization Certification"],
    coverHook: "ensuring safe, accurate medication therapy and patient counseling",
  },
  {
    slug: "ca", label: "CA Resume", role: "Chartered Accountant",
    objective: "Chartered Accountant with expertise in audit, taxation, and financial reporting. Ensures compliance while driving financial efficiency.",
    skills: ["Auditing", "Taxation", "Financial Reporting", "IFRS/Ind AS", "GST", "Compliance", "Excel", "ERP (SAP)"],
    competencies: ["Audit & Assurance", "Direct/Indirect Tax", "Financial Reporting", "Internal Controls", "Advisory"],
    j1: ["Led statutory audits for clients with ₹500Cr+ turnover.", "Identified tax savings of ₹8Cr through planning.", "Strengthened internal controls, achieving clean audits."],
    j2: ["Managed GST compliance across multiple entities.", "Prepared Ind AS financial statements accurately and on time.", "Advised management on cost and working-capital optimization."],
    degree: "Chartered Accountant (CA)", certs: ["Chartered Accountant (ICAI)", "DISA (Information Systems Audit)"],
    coverHook: "ensuring compliance while uncovering real financial efficiency",
  },
  {
    slug: "lawyer", label: "Lawyer Resume", role: "Lawyer / Advocate",
    objective: "Lawyer with strong litigation, drafting, and advisory skills. Delivers thorough research and persuasive advocacy for favorable outcomes.",
    skills: ["Litigation", "Legal Research", "Contract Drafting", "Negotiation", "Compliance", "Due Diligence", "Case Management", "Advisory"],
    competencies: ["Litigation", "Corporate Law", "Contract Drafting", "Legal Research", "Client Advisory"],
    j1: ["Won 80%+ of litigated matters through rigorous preparation.", "Drafted and negotiated 200+ commercial contracts.", "Advised clients on regulatory compliance and risk."],
    j2: ["Led due diligence for M&A transactions.", "Reduced contract turnaround time 30% with templates.", "Represented clients before tribunals and high courts."],
    degree: "LL.B. / LL.M.", certs: ["Bar Council Enrollment", "Certificate in Corporate Law"],
    coverHook: "combining rigorous research with persuasive, ethical advocacy",
  },
];

export const TEMPLATE_META = TEMPLATES.map(({ slug, label, role, objective }) => ({ slug, label, role, objective }));

export function getTemplate(slug) {
  return TEMPLATES.find((t) => t.slug === slug) || null;
}

// Deterministic pick so each role gets a stable sample persona/city.
function pick(arr, i) {
  return arr[i % arr.length];
}

// Build a full ResumeContent object (matching the backend schema) for a role.
export function buildResumeContent(slug) {
  const t = getTemplate(slug);
  if (!t) return null;
  const idx = TEMPLATES.indexOf(t);
  const name = pick(SAMPLE_NAMES, idx);
  const city = pick(CITIES, idx);

  return {
    contact: {
      name,
      title: t.role,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@email.com`,
      phone: "+91 90000 00000",
      location: city,
      linkedin: `linkedin.com/in/${name.toLowerCase().replace(/\s+/g, "")}`,
      website: "",
    },
    profile_photo: "",
    summary: t.objective,
    experience: [
      {
        title: t.role,
        company: "TechCorp Solutions",
        location: city,
        start: "2022",
        end: "Present",
        bullets: t.j1,
      },
      {
        title: `${t.role} (Associate)`,
        company: "InnovateX Pvt. Ltd.",
        location: city,
        start: "2019",
        end: "2022",
        bullets: t.j2,
      },
    ],
    education: [
      {
        degree: t.degree,
        school: "Indian Institute of Technology",
        location: city,
        start: "2015",
        end: "2019",
        details: "First Class with Distinction",
      },
    ],
    skills: t.skills,
    skill_ratings: [],
    core_competencies: t.competencies,
    projects: [],
    certifications: t.certs,
    languages: ["English", "Hindi"],
    accomplishments: [],
    activities: [],
    references: [],
    custom_sections: [],
    section_order: ["summary", "contact", "skills", "core_competencies", "certifications", "experience", "education", "languages"],
  };
}

// A polished, role-specific cover letter for the sample.
export function buildCoverLetter(slug) {
  const t = getTemplate(slug);
  if (!t) return "";
  const top = t.skills.slice(0, 4).join(", ");
  return (
    `Dear Hiring Manager,\n\n` +
    `I am excited to apply for the ${t.role} position. With proven experience in ${top}, ` +
    `I am confident I can contribute to your team from day one by ${t.coverHook}.\n\n` +
    `In my recent roles I have ${t.j1[0].charAt(0).toLowerCase() + t.j1[0].slice(1)} ` +
    `I take pride in delivering measurable results while collaborating closely with cross-functional teams.\n\n` +
    `I would welcome the opportunity to discuss how my background in ${t.competencies.slice(0, 2).join(" and ")} ` +
    `can support your goals. Thank you for your consideration.\n\n` +
    `Sincerely,\n${pick(SAMPLE_NAMES, TEMPLATES.indexOf(t))}`
  );
}
